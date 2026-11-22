<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Super admin: consulta de la auditoría. */
class AuditAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'organization_id' => ['nullable', 'integer'], 'actor_user_id' => ['nullable', 'integer'],
            'action' => ['nullable', 'string', 'max:64'], 'from' => ['nullable', 'date'], 'to' => ['nullable', 'date'],
        ]);
        $page = AuditLog::query()
            ->when($request->integer('organization_id'), fn ($q, $v) => $q->where('organization_id', $v))
            ->when($request->integer('actor_user_id'), fn ($q, $v) => $q->where('actor_user_id', $v))
            ->when($request->input('action'), fn ($q, $v) => $q->where('action', 'like', addcslashes($v, '%_').'%'))
            ->when($request->input('from'), fn ($q, $v) => $q->where('created_at', '>=', $v))
            ->when($request->input('to'), fn ($q, $v) => $q->where('created_at', '<=', \Carbon\Carbon::parse($v)->endOfDay()))
            ->orderByDesc('id')->paginate(50);

        return response()->json([
            'data' => collect($page->items())->map(fn (AuditLog $a) => [
                'id' => $a->id, 'action' => $a->action, 'actor_user_id' => $a->actor_user_id, 'organization_id' => $a->organization_id,
                'target_type' => $a->target_type, 'target_id' => $a->target_id, 'data' => $a->data, 'ip' => $a->ip,
                'created_at' => $a->created_at?->toIso8601String(),
            ])->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }
}
