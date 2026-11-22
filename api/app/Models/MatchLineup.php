<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MatchLineup extends Model
{
    protected $fillable = ['event_id', 'player_id', 'is_starter', 'sport_position_id', 'jersey_number', 'minutes_played'];

    protected function casts(): array
    {
        return ['is_starter' => 'boolean', 'minutes_played' => 'integer', 'jersey_number' => 'integer'];
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }
}
