<?php

namespace App\Http\Controllers\App;

use App\Http\Controllers\Controller;
use App\Models\GuardianPlayer;
use App\Models\Invitation;
use App\Models\Player;
use App\Models\TeamPlayer;
use App\Services\InvitationService;
use App\Support\ApiError;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Vínculo padre-hijo desde la App. Las invitaciones de padre que el colegio envió al correo verificado
 * de la cuenta aparecen aquí; también se pueden aceptar con el código corto del correo (otro correo).
 * Se vincula al jugador una sola vez, no por equipo: si luego lo agregan a otro deporte, el padre lo ve.
 */
class LinkController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $invs = $this->pending()->where('email', $user->email)->orderBy('id')->get();

        return response()->json(['data' => $invs->map(fn (Invitation $i) => $this->payload($i))->values()]);
    }

    public function accept(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $inv = Invitation::where('role', 'guardian')->where('email', $user->email)->find($id);
        if (! $inv) {
            return ApiError::response('invitation_not_found', 'La invitación no existe o no es para su correo.', 404);
        }

        return $this->link($request, $inv);
    }

    public function decline(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $n = $this->pending()->where('email', $user->email)->whereKey($id)->update(['declined_at' => now()]);
        if (! $n) {
            return ApiError::response('invitation_not_found', 'La invitación no existe o ya no está pendiente.', 404);
        }
        Audit::log('invitation.declined', Invitation::find($id), [], Invitation::find($id)?->organization_id, $user->id);

        return response()->json(['data' => ['ok' => true]]);
    }

    /** Aceptar con el código del correo (p. ej. si la invitación llegó a otro correo). */
    public function redeem(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:20']]);
        $code = InvitationService::normalizeCode($data['code']);
        $inv = Invitation::where('role', 'guardian')->where('code', $code)->first();
        if (! $inv) {
            return ApiError::response('code_invalid', 'El código no es válido. Revíselo en el correo de invitación.', 422, ['fields' => ['code' => ['Código no válido.']]]);
        }

        return $this->link($request, $inv);
    }

    /** El padre deja de seguir a un hijo (lo puede volver a vincular con una nueva invitación). */
    public function unlink(Request $request, Player $player): JsonResponse
    {
        $user = $request->user();
        $n = GuardianPlayer::where('user_id', $user->id)->where('player_id', $player->id)->delete();
        if (! $n) {
            return ApiError::response('not_found', 'No encontramos ese hijo en su cuenta.', 404);
        }
        Audit::log('guardian.unlinked', $player, [], $player->organization_id, $user->id);

        return response()->json(['data' => ['ok' => true]]);
    }

    private function link(Request $request, Invitation $inv): JsonResponse
    {
        $user = $request->user();
        $result = DB::transaction(function () use ($inv, $user) {
            $locked = Invitation::whereKey($inv->id)->lockForUpdate()->first();
            // Ya aceptada por este mismo padre: responde igual (idempotente).
            if ($locked->accepted_at) {
                return (int) $locked->accepted_by === $user->id ? 'ok' : 'used';
            }
            if ($locked->revoked_at || $locked->declined_at || $locked->expires_at->isPast() || ! $locked->player_id) {
                return 'closed';
            }
            if (! Player::whereKey($locked->player_id)->exists()) {
                return 'closed';
            }
            GuardianPlayer::updateOrCreate(['user_id' => $user->id, 'player_id' => $locked->player_id], ['verified_at' => now()]);
            $locked->update(['accepted_at' => now(), 'accepted_by' => $user->id]);

            return 'ok';
        });

        if ($result === 'used') {
            return ApiError::response('invitation_used', 'Esta invitación ya fue aceptada por otra cuenta.', 409);
        }
        if ($result === 'closed') {
            return ApiError::response('invitation_closed', 'La invitación venció, fue anulada o rechazada. Pida una nueva a la institución.', 410);
        }
        Audit::log('invitation.accepted', $inv, ['via' => 'app'], $inv->organization_id, $user->id);

        return response()->json(['data' => ['ok' => true, 'child_id' => (int) $inv->player_id]]);
    }

    private function pending()
    {
        return Invitation::with('organization')->where('role', 'guardian')
            ->whereNull('accepted_at')->whereNull('revoked_at')->whereNull('declined_at')
            ->where('expires_at', '>', now())->whereNotNull('player_id');
    }

    private function payload(Invitation $i): array
    {
        $player = Player::find($i->player_id);
        $teams = $player ? TeamPlayer::with('team.sport')->where('player_id', $player->id)->where('active', true)->get()
            ->filter(fn ($r) => $r->team)->map(fn ($r) => [
                'name' => $r->team->name,
                'sport' => ['code' => $r->team->sport->code, 'name' => $r->team->sport->name],
            ])->values() : collect();

        return [
            'id' => $i->id,
            'organization' => ['id' => $i->organization->id, 'name' => $i->organization->name, 'crest_url' => $i->organization->brandingPayload()['crest_url']],
            'player' => ['first_name' => $player?->first_name],
            'teams' => $teams,
            'expires_at' => $i->expires_at->toIso8601String(),
        ];
    }
}
