<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\User;
use App\Services\PasswordResetService;
use App\Support\ApiError;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

/** Recuperar contraseña por correo (respuesta igual exista o no el correo) y restablecer con el token. */
class PasswordResetController extends Controller
{
    public function __construct(private PasswordResetService $resets) {}

    public function forgot(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email:rfc', 'max:191'], 'slug' => ['nullable', 'string', 'max:60']]);
        $user = User::where('email', Str::lower(trim($data['email'])))->first();

        if ($user && $user->isActive()) {
            $org = ! empty($data['slug']) ? Organization::where('slug', $data['slug'])->first() : null;
            if ($org && ! $org->members()->where('user_id', $user->id)->exists()) {
                $org = null;
            }
            $token = $this->resets->create($user, 'email', null, now()->addMinutes(PasswordResetService::EMAIL_MINUTES));
            $this->resets->mailAfterResponse($user, $this->resets->url($user, $token, $org));
            Audit::log('auth.password_reset_requested', $user, [], $org?->id, $user->id);
        }

        return response()->json(['data' => ['ok' => true, 'message' => 'Si el correo está registrado, recibirá un enlace para crear una nueva contraseña.']]);
    }

    public function show(string $token): JsonResponse
    {
        $link = $this->resets->find($token);
        if (! $link) {
            return ApiError::response('reset_invalid', 'El enlace no es válido o ya venció. Pida uno nuevo.', 410);
        }
        $email = User::find($link->user_id)?->email ?? '';
        [$u, $d] = explode('@', $email, 2) + [1 => ''];

        return response()->json(['data' => ['email_masked' => mb_substr($u, 0, 2).str_repeat('*', max(1, mb_strlen($u) - 2)).'@'.$d]]);
    }

    public function reset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'max:64'],
            'password' => ['required', 'string', 'max:200', 'confirmed', Password::defaults()],
        ]);

        $user = DB::transaction(function () use ($data) {
            $link = $this->resets->find($data['token']);
            if (! $link) {
                return null;
            }
            $locked = DB::table('password_reset_links')->where('id', $link->id)->whereNull('used_at')->lockForUpdate()->first();
            if (! $locked) {
                return null;
            }
            $user = User::find($link->user_id);
            if (! $user || ! $user->isActive()) {
                return null;
            }
            $user->forceFill([
                'password' => $data['password'], 'must_change_password' => false,
                'failed_logins' => 0, 'locked_until' => null,
            ])->save();
            $user->tokens()->delete(); // cierra todas las sesiones
            DB::table('password_reset_links')->where('id', $link->id)->update(['used_at' => now(), 'updated_at' => now()]);

            return $user;
        });

        if (! $user) {
            return ApiError::response('reset_invalid', 'El enlace no es válido o ya venció. Pida uno nuevo.', 410);
        }
        Audit::log('auth.password_reset', $user, [], null, $user->id);

        return response()->json(['data' => ['ok' => true, 'email' => $user->email]]);
    }
}
