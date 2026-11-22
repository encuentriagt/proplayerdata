<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\OrganizationMember;
use App\Services\BrandingService;
use App\Services\InvitationService;
use App\Services\PlanService;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Super admin: organizaciones (colegios y equipos), su marca blanca, cupos, estado y administradores. */
class OrganizationAdminController extends Controller
{
    public function __construct(private InvitationService $invitations, private PlanService $plans) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate(['search' => ['nullable', 'string', 'max:80'], 'status' => ['nullable', Rule::in(['active', 'suspended'])]]);
        $page = Organization::query()
            ->when($request->input('search'), fn ($q, $s) => $q->where(fn ($w) => $w->where('name', 'like', '%'.addcslashes($s, '%_').'%')->orWhere('slug', 'like', '%'.addcslashes($s, '%_').'%')))
            ->when($request->input('status'), fn ($q, $s) => $q->where('status', $s))
            ->withCount(['teams', 'players'])
            ->orderBy('name')->paginate(50);

        return response()->json([
            'data' => collect($page->items())->map(fn (Organization $o) => $this->payload($o, false))->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    public function show(Organization $organization): JsonResponse
    {
        $organization->loadCount(['teams', 'players']);

        return response()->json(['data' => $this->payload($organization, true)]);
    }

    /** Crea la organización y, si viene admin_email, invita a su administrador (devuelve invite_url). */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(array_merge($this->rules(), [
            'slug' => ['required', 'regex:'.Organization::SLUG_REGEX, Rule::unique('organizations', 'slug')],
            'admin_email' => ['nullable', 'email:rfc', 'max:191'],
        ]));

        $result = DB::transaction(function () use ($data, $request) {
            $org = Organization::create(collect($data)->except('admin_email')->all() + ['status' => 'active']);
            Audit::log('organization.created', $org, ['slug' => $org->slug], $org->id);
            $invite = null;
            if (! empty($data['admin_email'])) {
                [$inv, $token] = $this->invitations->create($org, $data['admin_email'], 'org_admin', null, null, $request->user());
                $this->invitations->sendAfterResponse($inv, $token);
                $invite = $this->invitations->url($inv, $token);
            }

            return [$org, $invite];
        });

        return response()->json(['data' => $this->payload($result[0], true), 'meta' => ['admin_invite_url' => $result[1]]], 201);
    }

    public function update(Request $request, Organization $organization): JsonResponse
    {
        $data = $request->validate(array_merge($this->rules(true), [
            'status' => ['sometimes', Rule::in(['active', 'suspended'])],
        ]));
        $before = $organization->status->value;
        $organization->update($data);

        Audit::log('organization.updated', $organization, ['fields' => array_keys($data)], $organization->id);
        if (isset($data['status']) && $data['status'] !== $before) {
            Audit::log('organization.'.($data['status'] === 'suspended' ? 'suspended' : 'reactivated'), $organization, [], $organization->id);
        }

        return response()->json(['data' => $this->payload($organization->fresh(), true)]);
    }

    public function branding(Request $request, Organization $organization, string $kind, BrandingService $branding): JsonResponse
    {
        abort_unless(isset(BrandingService::KINDS[$kind]), 404);
        $request->validate(['image' => BrandingService::RULES]);
        $url = $branding->store($organization, $kind, $request->file('image'));
        Audit::log('organization.branding_updated', $organization, ['kind' => $kind], $organization->id);

        return response()->json(['data' => ['kind' => $kind, 'url' => $url]]);
    }

    public function invite(Request $request, Organization $organization): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email:rfc', 'max:191'],
            'role' => ['required', Rule::in(['org_admin', 'director', 'coach'])],
        ]);
        [$inv, $token] = $this->invitations->create($organization, $data['email'], $data['role'], null, null, $request->user());
        $this->invitations->sendAfterResponse($inv, $token);
        Audit::log('invitation.created', $inv, ['role' => $inv->role, 'by' => 'super_admin'], $organization->id);

        return response()->json(['data' => [
            'id' => $inv->id, 'email' => $inv->email, 'role' => $inv->role,
            'expires_at' => $inv->expires_at->toIso8601String(), 'invite_url' => $this->invitations->url($inv, $token),
        ]], 201);
    }

    public function members(Organization $organization): JsonResponse
    {
        $members = OrganizationMember::with('user:id,name,email,last_login_at,status')->where('organization_id', $organization->id)->get();

        return response()->json(['data' => $members->map(fn ($m) => [
            'id' => $m->id, 'user_id' => $m->user_id, 'name' => $m->user?->name, 'email' => $m->user?->email,
            'role' => $m->role->value, 'status' => $m->status, 'last_login_at' => $m->user?->last_login_at?->toIso8601String(),
        ])]);
    }

    private function rules(bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';
        $color = ['sometimes', 'regex:'.Organization::COLOR_REGEX];

        return [
            'name' => [$req, 'string', 'min:3', 'max:150'],
            'type' => [$req, Rule::in(['school', 'team'])],
            'color_primary' => $color, 'color_secondary' => $color, 'color_on_primary' => $color,
            'branding_editable_by_org' => ['sometimes', 'boolean'],
            'quota_pro' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'quota_premium' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'contact_email' => ['nullable', 'email:rfc', 'max:191'],
            'contact_phone' => ['nullable', 'string', 'max:30'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    private function payload(Organization $o, bool $full): array
    {
        $data = array_merge($o->brandingPayload(), [
            'id' => $o->id, 'status' => $o->status->value,
            'quota_pro' => $o->quota_pro, 'quota_premium' => $o->quota_premium,
            'branding_editable_by_org' => $o->branding_editable_by_org,
            'teams_count' => $o->teams_count ?? null, 'players_count' => $o->players_count ?? null,
            'created_at' => $o->created_at?->toIso8601String(),
        ]);
        if ($full) {
            $data += ['contact_email' => $o->contact_email, 'contact_phone' => $o->contact_phone, 'notes' => $o->notes, 'plan_usage' => $this->plans->usage($o)];
        }

        return $data;
    }
}
