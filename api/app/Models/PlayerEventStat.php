<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlayerEventStat extends Model
{
    protected $fillable = ['event_id', 'player_id', 'minutes_played', 'stats'];

    protected function casts(): array
    {
        return ['stats' => 'array', 'minutes_played' => 'integer'];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }
}
