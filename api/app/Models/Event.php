<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Event extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'organization_id', 'team_id', 'series_id', 'type', 'title', 'starts_at', 'time_pending', 'ends_at', 'location',
        'opponent_name', 'home_away', 'status', 'score_us', 'score_them', 'result_published_at', 'published_at', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime', 'ends_at' => 'datetime', 'result_published_at' => 'datetime', 'published_at' => 'datetime', 'time_pending' => 'boolean',
            'score_us' => 'integer', 'score_them' => 'integer',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class)->withTrashed();
    }

    public function callups(): HasMany
    {
        return $this->hasMany(EventCallup::class);
    }

    public function attendances(): HasMany
    {
        return $this->hasMany(Attendance::class);
    }

    public function lineup(): HasMany
    {
        return $this->hasMany(MatchLineup::class);
    }

    public function actions(): HasMany
    {
        return $this->hasMany(MatchAction::class);
    }

    public function playerStats(): HasMany
    {
        return $this->hasMany(PlayerEventStat::class);
    }

    /** Si al crear no se indica published_at, la actividad nace publicada (borrador solo cuando se pide). */
    protected static function booted(): void
    {
        static::creating(function (Event $e) {
            if (! array_key_exists('published_at', $e->getAttributes())) {
                $e->published_at = now();
            }
        });
    }

    public function isDraft(): bool
    {
        return $this->published_at === null;
    }

    /** Solo actividades publicadas (lo que ve la App). */
    public function scopePublished($query)
    {
        return $query->whereNotNull('published_at');
    }

    public function displayTitle(): string
    {
        if ($this->title) {
            return $this->title;
        }

        $team = $this->team?->name;

        return match ($this->type) {
            // "{equipo} vs {rival}", igual en la PC, la App y los avisos.
            'match' => $team
                ? $team.($this->opponent_name ? ' vs '.$this->opponent_name : ' · Partido')
                : 'Partido'.($this->opponent_name ? ' vs '.$this->opponent_name : ''),
            'training' => 'Entrenamiento',
            default => 'Actividad',
        };
    }

    public function payload(): array
    {
        return [
            'id' => $this->id,
            'team_id' => $this->team_id,
            'team_name' => $this->relationLoaded('team') ? $this->team?->name : null,
            'type' => $this->type,
            'title' => $this->title,
            'display_title' => $this->displayTitle(),
            'starts_at' => $this->starts_at?->toIso8601String(),
            'time_pending' => (bool) $this->time_pending,
            'series_id' => $this->series_id,
            'ends_at' => $this->ends_at?->toIso8601String(),
            'location' => $this->location,
            'opponent_name' => $this->opponent_name,
            'home_away' => $this->home_away,
            'status' => $this->status,
            'is_draft' => $this->isDraft(),
            'published_at' => $this->published_at?->toIso8601String(),
            'score_us' => $this->score_us,
            'score_them' => $this->score_them,
            'result_published_at' => $this->result_published_at?->toIso8601String(),
            'notes' => $this->notes,
        ];
    }
}
