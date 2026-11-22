<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\URL;

class Player extends Model
{
    use SoftDeletes;

    protected $fillable = ['organization_id', 'first_name', 'last_name', 'birthdate', 'gender', 'document_number', 'notes'];

    protected $hidden = ['document_number', 'notes', 'photo_path'];

    protected function casts(): array
    {
        return [
            'birthdate' => 'date',
            'document_number' => 'encrypted',
            'notes' => 'encrypted',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function teams(): BelongsToMany
    {
        return $this->belongsToMany(Team::class, 'team_players')
            ->withPivot(['jersey_number', 'sport_position_id', 'active'])->withTimestamps();
    }

    public function guardians(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'guardian_players')->withPivot(['relationship', 'verified_at'])->withTimestamps();
    }

    public function fullName(): string
    {
        return trim($this->first_name.' '.$this->last_name);
    }

    /** URL firmada y de corta duración para la foto (nunca pública). */
    public function photoUrl(): ?string
    {
        if (! $this->photo_path) {
            return null;
        }

        return URL::temporarySignedRoute('files.player-photo', now()->addMinutes(15), [
            'player' => $this->id,
            'v' => substr(hash('sha256', $this->photo_path), 0, 10),
        ]);
    }

    /** Datos para staff (coach/director/admin). $sensitive incluye documento y notas. */
    public function payload(bool $sensitive = false): array
    {
        $data = [
            'id' => $this->id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'full_name' => $this->fullName(),
            'birthdate' => $this->birthdate?->toDateString(),
            'gender' => $this->gender,
            'photo_url' => $this->photoUrl(),
        ];
        if ($sensitive) {
            $data['document_number'] = $this->document_number;
            $data['notes'] = $this->notes;
        }

        return $data;
    }
}
