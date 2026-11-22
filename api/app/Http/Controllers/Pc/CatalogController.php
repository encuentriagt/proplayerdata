<?php

namespace App\Http\Controllers\Pc;

use App\Http\Controllers\Controller;
use App\Models\Sport;
use Illuminate\Http\JsonResponse;

/** GET /api/catalog/sports — catálogo de deportes activos con posiciones y estadísticas. */
class CatalogController extends Controller
{
    public function sports(): JsonResponse
    {
        $sports = Sport::with(['positions', 'statTypes'])->where('active', true)->orderBy('sort')->get();

        return response()->json(['data' => $sports->map->payload()->values()]);
    }
}
