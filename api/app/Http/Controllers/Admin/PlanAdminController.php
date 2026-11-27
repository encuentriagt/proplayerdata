<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\PlanGrant;
use App\Models\User;
use App\Services\PlanService;
use App\Support\ApiError;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Super admin: asignar planes a cualquier padre (con o sin consumir el cupo de una organización). */
class PlanAdminController extends Controller
{
    public function __construct(private PlanService $plans) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate(['email' => ['nullable', 'string', 'max:191'], 'organization_id' => ['nullable', 'integer']]);
        $q = PlanGrant::with(['user:id,name,email', 'organization:id,name'])->orderByDesc('id');
        if ($e = $request->input('email')) {
            $q->whereHas('user', fn ($u) => $u->where('email', Str::lower(trim($e))));
        }
        if ($o = $request->integer('organization_id')) {
            $q->where('organization_id', $o);
        }
        $page = $q->paginate(50);

        return response()->json([
            'data' => collect($page->items())->map(fn (PlanGrant $g) => array_merge($g->payload(), [
                'user_name' => $g->user?->name, 'user_email' => $g->user?->email, 'organization_name' => $g->organization?->name,
                'active' => ! $g->revoked_at && (! $g->ends_at || $g->ends_at->isFuture()),
            ]))->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email:rfc', 'max:191'],
            'plan' => ['required', Rule::in(['pro', 'premium'])],
            'organization_id' => ['nullable', 'integer', Rule::exists('organizations', 'id')],
            'ends_at' => ['nullable', 'date', 'after:today'],
            'note' => ['nullable', 'string', 'max:200'],
        ]);
        $user = User::guardians()->where('email', Str::lower(trim($data['email'])))->first();
        if (! $user) {
            return ApiError::response('user_not_found', 'No existe un usuario con ese correo.', 422);
        }
        $org = isset($data['organization_id']) ? Organization::find($data['organization_id']) : null;

        $grant = $this->plans->grant($user, $data['plan'], $org, 'super_admin', $request->user(),
            isset($data['ends_at']) ? \Carbon\Carbon::parse($data['ends_at'])->endOfDay() : null, $data['note'] ?? null);
        Audit::log('plan.granted', $grant, ['plan' => $grant->plan, 'user_id' => $user->id, 'by' => 'super_admin'], $org?->id);

        return response()->json(['data' => $grant->payload()], 201);
    }

    public function destroy(PlanGrant $grant): JsonResponse
    {
        if (! $grant->revoked_at) {
            $grant->update(['revoked_at' => now()]);
            Audit::log('plan.revoked', $grant, ['by' => 'super_admin'], $grant->organization_id);
        }

        return response()->json(['data' => ['ok' => true]]);
    }
}
