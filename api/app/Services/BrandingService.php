<?php

namespace App\Services;

use App\Models\Organization;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/** Imágenes de marca blanca (públicas): logo, escudo, portada. Sin SVG (puede llevar código). */
final class BrandingService
{
    public const KINDS = ['logo' => 'logo_path', 'crest' => 'crest_path', 'cover' => 'cover_path'];

    public const RULES = ['required', 'file', 'mimes:png,jpg,jpeg,webp', 'mimetypes:image/png,image/jpeg,image/webp', 'max:2048', 'dimensions:max_width=4000,max_height=4000'];

    public function store(Organization $org, string $kind, UploadedFile $file): string
    {
        $column = self::KINDS[$kind];
        $path = $file->storeAs("orgs/{$org->id}", $kind.'-'.Str::uuid().'.'.$file->extension(), 'public');
        $old = $org->{$column};
        $org->forceFill([$column => $path])->save();
        if ($old) {
            Storage::disk('public')->delete($old);
        }

        return Storage::disk('public')->url($path);
    }
}
