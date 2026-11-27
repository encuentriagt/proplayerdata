<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\GuardianPlayer;
use App\Models\Organization;
use App\Models\PlanGrant;
use App\Models\User;
use App\Services\PlanService;
use App\Support\ApiError;
use App\Support\Audit;
use App\Support\OrgAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Planes Pro/Premium que la organización asigna a sus padres, dentro del cupo (solo admin). */
class PlanController extends Controller
{
    public function __construct(private PlanService $plans) {}

    public function index(Organization $organization, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());
        $grants = PlanGrant::active()->with('user:id,name,email')->where('organization_id', $organization->id)->orderByDesc('id')->get();

        return response()->json([
            'data' => $grants->map(fn (PlanGrant $g) => array_merge($g->payload(), ['user_name' => $g->user?->name, 'user_email' => $g->user?->email]))->values(),
            'meta' => ['usage' => $this->plans->usage($organization)],
        ]);
    }

    public function store(Request $request, Organization $organization, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin());
        $data = $request->validate([
            'email' => ['required', 'email:rfc', 'max:191'],
            'plan' => ['required', Rule::in(['pro', 'premium'])],
            'ends_at' => ['nullable', 'date', 'after:today'],
            'note' => ['nullable', 'string', 'max:200'],
        ]);

        $user = User::guardians()->where('email', Str::lower(trim($data['email'])))->first();
        $isGuardianHere = $user && GuardianPlayer::where('user_id', $user->id)
            ->whereHas('player', fn ($q) => $q->where('organization_id', $organization->id))->exists();
        if (! $isGuardianHere) {
            return ApiError::response('not_a_guardian', 'Ese correo no corresponde a un padre o encargado de su organización.', 422);
        }

        $grant = $this->plans->grant($user, $data['plan'], $organization, 'org_admin', $access->user,
            isset($data['ends_at']) ? \Carbon\Carbon::parse($data['ends_at'])->endOfDay() : null, $data['note'] ?? null);
        Audit::log('plan.granted', $grant, ['plan' => $grant->plan, 'user_id' => $user->id], $organization->id);

        return response()->json(['data' => $grant->payload(), 'meta' => ['usage' => $this->plans->usage($organization)]], 201);
    }

    public function destroy(Organization $organization, PlanGrant $grant, OrgAccess $access): JsonResponse
    {
        $access->authorize($access->isAdmin() && $grant->organization_id === $organization->id);
        if (! $grant->revoked_at) {
            $grant->update(['revoked_at' => now()]);
            Audit::log('plan.revoked', $grant, ['plan' => $grant->plan, 'user_id' => $grant->user_id], $organization->id);
        }

        return response()->json(['data' => ['ok' => true], 'meta' => ['usage' => $this->plans->usage($organization)]]);
    }
}
