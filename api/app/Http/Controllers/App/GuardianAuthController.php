<?php

namespace App\Http\Controllers\App;

use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\EmailCodeService;
use App\Support\ApiError;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

/**
 * Cuentas de padre (App): registro propio, verificación del correo con código y contraseña olvidada con código.
 * Son independientes de las cuentas de staff aunque usen el mismo correo.
 */
class GuardianAuthController extends Controller
{
    public function __construct(private EmailCodeService $codes) {}

    public function register(Request $request): JsonResponse
    {
        $platform = Str::lower((string) $request->header('X-App-Platform'));
        if (! in_array($platform, ['android', 'ios'], true)) {
            return ApiError::response('platform_invalid', 'El registro se hace desde la App (X-App-Platform: android o ios).', 422);
        }
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'email' => ['required', 'email:rfc', 'max:191'],
            'phone' => ['nullable', 'string', 'regex:/^\+?[0-9 ()-]{8,20}$/'],
            'password' => ['required', 'string', 'max:200', 'confirmed', Password::defaults()],
        ]);
        $email = Str::lower(trim($data['email']));
        if (User::withTrashed()->guardians()->where('email', $email)->exists()) {
            return ApiError::response('email_taken', 'Ya existe una cuenta de padre con ese correo. Inicie sesión o recupere su contraseña.', 422, [
                'fields' => ['email' => ['Ya existe una cuenta con este correo.']],
            ]);
        }

        $user = DB::transaction(function () use ($data, $email) {
            $u = new User(['name' => trim($data['name']), 'email' => $email, 'phone' => $data['phone'] ?? null, 'password' => $data['password']]);
            $u->forceFill(['account_type' => User::GUARDIAN, 'status' => 'active'])->save();

            return $u;
        });
        $this->codes->send($user, 'verify');
        $token = AuthController::issueToken($user, $platform);
        Audit::log('auth.guardian_registered', $user, ['platform' => $platform], null, $user->id);

        return response()->json(['data' => app(AuthController::class)->sessionPayload($user->fresh(), $token, collect())], 201);
    }

    public function verifyEmail(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'digits:6']]);
        $user = $request->user();
        if ($user->email_verified_at) {
            return response()->json(['data' => ['ok' => true, 'email_verified' => true]]);
        }
        if (! $this->codes->consume($user, 'verify', $data['code'])) {
            return ApiError::response('code_invalid', 'El código no es válido o ya venció. Pida uno nuevo.', 422, ['fields' => ['code' => ['Código no válido.']]]);
        }
        $user->forceFill(['email_verified_at' => now()])->save();
        Audit::log('auth.email_verified', $user);

        return response()->json(['data' => ['ok' => true, 'email_verified' => true]]);
    }

    public function resend(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user->email_verified_at) {
            $this->codes->send($user, 'verify');
        }

        return response()->json(['data' => ['ok' => true, 'minutes' => EmailCodeService::MINUTES]]);
    }

    /** Siempre la misma respuesta, exista o no la cuenta. */
    public function forgot(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email:rfc', 'max:191']]);
        $user = User::guardians()->where('email', Str::lower(trim($data['email'])))->first();
        if ($user && $user->isActive()) {
            $this->codes->send($user, 'reset');
            Audit::log('auth.password_reset_requested', $user, ['via' => 'app_code'], null, $user->id);
        }

        return response()->json(['data' => ['ok' => true, 'minutes' => EmailCodeService::MINUTES,
            'message' => 'Si el correo está registrado, recibirá un código para crear una nueva contraseña.']]);
    }

    public function reset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email:rfc', 'max:191'],
            'code' => ['required', 'digits:6'],
            'password' => ['required', 'string', 'max:200', 'confirmed', Password::defaults()],
        ]);
        $user = User::guardians()->where('email', Str::lower(trim($data['email'])))->first();
        if (! $user || ! $user->isActive() || ! $this->codes->consume($user, 'reset', $data['code'])) {
            return ApiError::response('code_invalid', 'El código no es válido o ya venció. Pida uno nuevo.', 422, ['fields' => ['code' => ['Código no válido.']]]);
        }
        DB::transaction(function () use ($user, $data) {
            // El código llegó a su correo: también queda verificado. Se cierran todas las sesiones.
            $user->forceFill(['password' => $data['password'], 'must_change_password' => false, 'failed_logins' => 0, 'locked_until' => null,
                'email_verified_at' => $user->email_verified_at ?? now()])->save();
            $user->tokens()->delete();
        });
        Audit::log('auth.password_reset', $user, ['via' => 'app_code'], null, $user->id);

        return response()->json(['data' => ['ok' => true]]);
    }
}
