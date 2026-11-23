<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\Invitation;
use App\Models\Organization;
use App\Models\Player;
use App\Models\Team;
use App\Services\InvitationService;
use App\Support\Audit;
use App\Support\OrgAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Invitaciones de la organización.
 * - Admin: puede invitar org_admin, director, coach y padres.
 * - Coach/director: solo padres de jugadores que ve.
 * La respuesta incluye invite_url (solo para quien la crea) por si se quiere compartir por otro medio.
 */
class InvitationController extends Controller
{
    public function __construct(private InvitationService $service) {}

    public function index(Organization $organization, OrgAccess $access): JsonResponse
    {
        $q = Invitation::where('organization_id', $organization->id)
            ->whereNull('accepted_at')->whereNull('revoked_at')->where('expires_at', '>', now())
            ->orderByDesc('id');
        if (! $access->isAdmin()) {
            $q->where('created_by', $access->user->id);
        }

        return response()->json(['data' => $q->get()->map(fn (Invitation $i) => [
            'id' => $i->id, 'email' => $i->email, 'role' => $i->role,
            'role_label' => InvitationService::ROLE_LABELS[$i->role] ?? $i->role,
            'player_id' => $i->player_id, 'team_ids' => $i->team_ids, 'sport_ids' => $i->sport_ids,
            'expires_at' => $i->expires_at->toIso8601String(),
        ])]);
    }

    public function store(Request $request, Organization $organization, OrgAccess $access): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email:rfc', 'max:191'],
            'role' => ['required', Rule::in(['org_admin', 'director', 'coach', 'guardian'])],
            'player_id' => ['required_if:role,guardian', 'nullable', 'integer'],
            'team_ids' => ['nullable', 'array', 'max:30'],
            'team_ids.*' => ['integer'],
            'sport_ids' => ['nullable', 'array', 'max:30'],
            'sport_ids.*' => ['integer'],
        ]);
        $access->authorize(in_array($data['role'], $access->invitableRoles(), true));
        $teamIds = array_values(array_unique(array_map('intval', $data['team_ids'] ?? [])));
        $sportIds = array_values(array_unique(array_map('intval', $data['sport_ids'] ?? [])));

        if ($data['role'] === 'guardian') {
            $player = Player::where('organization_id', $organization->id)->find($data['player_id']);
            $access->authorize($player !== null && $access->canViewPlayer($player));
            $teamIds = $sportIds = [];
        } else {
            $data['player_id'] = null;
            if ($teamIds && Team::where('organization_id', $organization->id)->whereIn('id', $teamIds)->count() !== count($teamIds)) {
                return response()->json(['error' => ['code' => 'validation_failed', 'message' => 'Hay equipos que no pertenecen a su organización.']], 422);
            }
            if ($sportIds && \App\Models\Sport::whereIn('id', $sportIds)->count() !== count($sportIds)) {
                return response()->json(['error' => ['code' => 'validation_failed', 'message' => 'Hay deportes que no existen.']], 422);
            }
            // El director solo asigna equipos de su alcance a los coaches que invita.
            if (! $access->isAdmin() && array_diff($teamIds, $access->directedTeamIds())) {
                return response()->json(['error' => ['code' => 'forbidden', 'message' => 'Solo puede asignar equipos que usted dirige.']], 403);
            }
            // sport_ids solo aplica a directores (alcance por deportes completos).
            if ($data['role'] !== 'director') {
                $sportIds = [];
            }
            if ($data['role'] === 'director' && ! $teamIds && ! $sportIds) {
                return response()->json(['error' => ['code' => 'validation_failed', 'message' => 'Asigne al menos un deporte o un equipo al director técnico.', 'fields' => ['sport_ids' => ['Asigne al menos un deporte o un equipo.']]]], 422);
            }
        }

        [$inv, $token] = $this->service->create($organization, $data['email'], $data['role'], $data['player_id'], $teamIds ?: null, $access->user, $sportIds ?: null);
        $this->service->sendAfterResponse($inv, $token);
        Audit::log('invitation.created', $inv, ['role' => $inv->role, 'player_id' => $inv->player_id], $organization->id);

        return response()->json(['data' => [
            'id' => $inv->id,
            'email' => $inv->email,
            'role' => $inv->role,
            'team_ids' => $inv->team_ids,
            'sport_ids' => $inv->sport_ids,
            'expires_at' => $inv->expires_at->toIso8601String(),
            'invite_url' => $this->service->url($inv, $token),
        ]], 201);
    }

    /** Rota el token (el enlace anterior deja de servir), extiende la vigencia y reenvía el correo. */
    public function resend(Organization $organization, Invitation $invitation, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin() || $invitation->created_by === $access->user->id);
        if ($invitation->accepted_at || $invitation->revoked_at) {
            return response()->json(['error' => ['code' => 'invitation_unusable', 'message' => 'La invitación ya fue usada o anulada.']], 422);
        }
        $token = \Illuminate\Support\Str::random(48);
        $invitation->update([
            'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addDays((int) config('ppd.invitations.days_valid')),
        ]);
        $this->service->sendAfterResponse($invitation, $token);
        Audit::log('invitation.resent', $invitation, [], $organization->id);

        return response()->json(['data' => [
            'id' => $invitation->id, 'email' => $invitation->email, 'role' => $invitation->role,
            'expires_at' => $invitation->expires_at->toIso8601String(),
            'invite_url' => $this->service->url($invitation, $token),
        ]]);
    }

    public function destroy(Organization $organization, Invitation $invitation, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin() || $invitation->created_by === $access->user->id);
        $invitation->update(['revoked_at' => now()]);
        Audit::log('invitation.revoked', $invitation, [], $organization->id);

        return response()->json(['data' => ['ok' => true]]);
    }
}
