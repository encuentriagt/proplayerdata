<?php

namespace App\Http\Controllers\Me;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\UserNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Dispositivos (token FCM) y bandeja de avisos del usuario autenticado. */
class MeController extends Controller
{
    public function registerDevice(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'min:20', 'max:4096'],
            'platform' => ['required', Rule::in(['android', 'ios', 'web'])],
        ]);
        $hash = hash('sha256', $data['token']);

        // Un token pertenece a un solo usuario (si el teléfono cambia de cuenta, se reasigna).
        Device::updateOrCreate(['token_hash' => $hash], [
            'user_id' => $request->user()->id, 'platform' => $data['platform'],
            'fcm_token' => $data['token'], 'last_seen_at' => now(),
        ]);

        return response()->json(['data' => ['ok' => true]]);
    }

    public function removeDevice(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'max:4096']]);
        Device::where('user_id', $request->user()->id)->where('token_hash', hash('sha256', $data['token']))->delete();

        return response()->json(['data' => ['ok' => true]]);
    }

    public function notifications(Request $request): JsonResponse
    {
        $page = UserNotification::where('user_id', $request->user()->id)->orderByDesc('id')->paginate(30);

        return response()->json([
            'data' => collect($page->items())->map->payload()->values(),
            'meta' => [
                'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(),
                'unread' => UserNotification::where('user_id', $request->user()->id)->whereNull('read_at')->count(),
            ],
        ]);
    }

    public function markRead(Request $request): JsonResponse
    {
        $data = $request->validate(['ids' => ['nullable', 'array', 'max:200'], 'ids.*' => ['integer']]);
        $q = UserNotification::where('user_id', $request->user()->id)->whereNull('read_at');
        if (! empty($data['ids'])) {
            $q->whereIn('id', $data['ids']);
        }

        return response()->json(['data' => ['updated' => $q->update(['read_at' => now()])]]);
    }

    /** "Enterado" de un aviso urgente (lesión): lo marca leído y confirmado. Repetirlo responde igual. */
    public function ack(Request $request, int $id): JsonResponse
    {
        $n = UserNotification::where('user_id', $request->user()->id)->findOrFail($id);
        if (! $n->acked_at) {
            $n->forceFill(['acked_at' => now(), 'read_at' => $n->read_at ?? now()])->save();
        }

        return response()->json(['data' => $n->payload()]);
    }
}
