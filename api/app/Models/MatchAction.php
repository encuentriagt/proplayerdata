<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MatchAction extends Model
{
    protected $fillable = ['event_id', 'type', 'sport_stat_type_id', 'player_id', 'related_player_id', 'period', 'minute', 'value', 'note', 'recorded_by'];

    protected function casts(): array
    {
        return ['value' => 'integer', 'period' => 'integer', 'minute' => 'integer'];
    }

    public function statType(): BelongsTo
    {
        return $this->belongsTo(SportStatType::class, 'sport_stat_type_id');
    }
}
