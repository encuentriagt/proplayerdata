<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/** GET /api/public/health — estado básico, sin datos internos. */
class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $db = true;
        try {
            DB::select('select 1');
        } catch (\Throwable) {
            $db = false;
        }

        return response()->json([
            'status' => $db ? 'ok' : 'degraded',
            'app' => config('ppd.name'),
            'time' => now()->toIso8601String(),
        ], $db ? 200 : 503);
    }
}
