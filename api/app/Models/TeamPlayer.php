<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TeamPlayer extends Model
{
    protected $fillable = ['team_id', 'player_id', 'jersey_number', 'sport_position_id', 'active'];

    protected function casts(): array
    {
        return ['active' => 'boolean', 'jersey_number' => 'integer'];
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }

    public function position(): BelongsTo
    {
        return $this->belongsTo(SportPosition::class, 'sport_position_id');
    }
}
