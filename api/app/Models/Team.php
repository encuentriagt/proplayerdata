<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Team extends Model
{
    use SoftDeletes;

    protected $fillable = ['organization_id', 'sport_id', 'season_id', 'name', 'category', 'gender', 'color'];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function sport(): BelongsTo
    {
        return $this->belongsTo(Sport::class);
    }

    public function season(): BelongsTo
    {
        return $this->belongsTo(Season::class);
    }

    public function staff(): HasMany
    {
        return $this->hasMany(TeamStaff::class);
    }

    public function roster(): HasMany
    {
        return $this->hasMany(TeamPlayer::class);
    }

    public function players(): BelongsToMany
    {
        return $this->belongsToMany(Player::class, 'team_players')
            ->withPivot(['jersey_number', 'sport_position_id', 'active'])->withTimestamps();
    }

    public function payload(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'category' => $this->category,
            'gender' => $this->gender,
            'color' => $this->color,
            'sport' => $this->relationLoaded('sport') ? $this->sport?->payload(false) : ['id' => $this->sport_id],
            'season' => $this->relationLoaded('season') ? $this->season?->payload() : null,
        ];
    }
}
