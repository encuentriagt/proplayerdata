<?php

namespace App\Http\Controllers\Files;

use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/** GET /api/files/players/{player}/photo — solo con URL firmada vigente (15 min). */
class PlayerPhotoController extends Controller
{
    public function __invoke(Player $player): Response
    {
        if (! $player->photo_path || ! Storage::disk('local')->exists($player->photo_path)) {
            abort(404);
        }

        return Storage::disk('local')->response($player->photo_path, null, [
            'Cache-Control' => 'private, max-age=900',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Disposition' => 'inline',
        ]);
    }
}
