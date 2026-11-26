<?php

namespace App\Http\Controllers\Public;

use App\Enums\OrganizationStatus;
use App\Http\Controllers\Controller;
use App\Models\Organization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/public/orgs?search= — buscador de instituciones para la pantalla de inicio de la PC.
 * Mínimo 2 caracteres, máximo 10 resultados, solo activas y con límite por IP para no listar el directorio.
 */
class OrgSearchController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate(['search' => ['required', 'string', 'min:2', 'max:60']]);
        $term = Organization::normalizeSearch($request->string('search')->toString());
        if (mb_strlen($term) < 2) {
            return $this->json([]);
        }
        $like = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $term);

        $orgs = Organization::where('status', OrganizationStatus::Active)
            ->where('search_key', 'like', '%'.$like.'%')
            // Primero las que empiezan con el texto.
            ->orderByRaw('CASE WHEN search_key LIKE ? THEN 0 ELSE 1 END', [$like.'%'])
            ->orderBy('name')
            ->limit(10)
            ->get();

        return $this->json($orgs->map->publicSearchPayload()->values()->all());
    }

    private function json(array $data): JsonResponse
    {
        return response()->json(['data' => $data])->header('Cache-Control', 'no-store');
    }
}
