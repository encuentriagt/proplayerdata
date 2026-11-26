<?php

namespace App\Models;

use App\Enums\OrganizationStatus;
use App\Enums\OrganizationType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;

class Organization extends Model
{
    use SoftDeletes;

    public const SLUG_REGEX = '/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/';

    public const COLOR_REGEX = '/^#[0-9A-Fa-f]{6}$/';

    protected $fillable = [
        'name', 'slug', 'type', 'status',
        'logo_path', 'crest_path', 'cover_path',
        'color_primary', 'color_secondary', 'color_on_primary', 'branding_editable_by_org',
        'quota_pro', 'quota_premium', 'contact_email', 'contact_phone', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'type' => OrganizationType::class,
            'status' => OrganizationStatus::class,
            'branding_editable_by_org' => 'boolean',
            'quota_pro' => 'integer',
            'quota_premium' => 'integer',
        ];
    }

    public function members(): HasMany
    {
        return $this->hasMany(OrganizationMember::class);
    }

    public function teams(): HasMany
    {
        return $this->hasMany(Team::class);
    }

    /** Deportes del catálogo que la organización activó (tabla organization_sports). */
    public function sports(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(Sport::class, 'organization_sports')->withTimestamps();
    }

    public function players(): HasMany
    {
        return $this->hasMany(Player::class);
    }

    public function seasons(): HasMany
    {
        return $this->hasMany(Season::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(Event::class);
    }

    public function invitations(): HasMany
    {
        return $this->hasMany(Invitation::class);
    }

    public function isActive(): bool
    {
        return $this->status === OrganizationStatus::Active;
    }

    /** Datos públicos de marca blanca (sin datos internos ni de contacto). */
    /** Mantiene search_key (nombre + slug, minúsculas y sin tildes) para el buscador público. */
    protected static function booted(): void
    {
        static::saving(function (Organization $o) {
            $o->search_key = self::normalizeSearch($o->name.' '.$o->slug);
        });
    }

    public static function normalizeSearch(string $text): string
    {
        return \Illuminate\Support\Str::lower(\Illuminate\Support\Str::ascii(trim($text)));
    }

    /** Lo único que muestra el buscador público: sin id, plan, cupos ni contactos. */
    public function publicSearchPayload(): array
    {
        $b = $this->brandingPayload();

        return ['name' => $b['name'], 'slug' => $b['slug'], 'logo_url' => $b['logo_url'], 'crest_url' => $b['crest_url'], 'colors' => $b['colors']];
    }

    public function brandingPayload(): array
    {
        $url = fn (?string $p) => $p ? Storage::disk('public')->url($p) : null;

        return [
            'name' => $this->name,
            'slug' => $this->slug,
            'type' => $this->type->value,
            'active' => $this->isActive(),
            'logo_url' => $url($this->logo_path),
            'crest_url' => $url($this->crest_path),
            'cover_url' => $url($this->cover_path),
            'colors' => [
                'primary' => $this->color_primary,
                'secondary' => $this->color_secondary,
                'on_primary' => $this->color_on_primary,
            ],
            'powered_by' => 'ppd',
        ];
    }
}
