<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attendance extends Model
{
    protected $fillable = ['event_id', 'player_id', 'status', 'note', 'recorded_by'];

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }
}
