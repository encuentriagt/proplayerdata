<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Support\ApiError;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** GET /api/public/orgs/{slug}/branding — marca blanca para el login de PC y la App. */
class BrandingController extends Controller
{
    public function __invoke(Request $request, string $slug): JsonResponse
    {
        if (! preg_match(Organization::SLUG_REGEX, $slug)) {
            return ApiError::response('not_found', 'No se encontró la organización.', 404);
        }

        $org = Organization::where('slug', $slug)->first();

        if (! $org) {
            return ApiError::response('not_found', 'No se encontró la organización.', 404);
        }

        $payload = $org->brandingPayload();
        $etag = '"'.hash('sha256', json_encode($payload)).'"';

        if ($request->headers->get('If-None-Match') === $etag) {
            return response()->json(null, 304)->setEtag(trim($etag, '"'))
                ->header('Cache-Control', 'public, max-age=300');
        }

        return response()->json(['data' => $payload])
            ->setEtag(trim($etag, '"'))
            ->header('Cache-Control', 'public, max-age=300');
    }
}
