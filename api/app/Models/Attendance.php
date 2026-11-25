<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attendance extends Model
{
    /** Asiste, no asiste con aviso, lesión, no justificado. ("late" se migró a present.) */
    public const STATUSES = ['present', 'excused', 'injured', 'absent'];

    protected $fillable = ['event_id', 'player_id', 'status', 'note', 'recorded_by'];

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class);
    }
}
