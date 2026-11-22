<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SportStatType extends Model
{
    protected $fillable = ['sport_id', 'code', 'name', 'scores', 'is_player_stat', 'sort'];

    protected function casts(): array
    {
        return ['scores' => 'integer', 'is_player_stat' => 'boolean'];
    }

    public function sport(): BelongsTo
    {
        return $this->belongsTo(Sport::class);
    }
}
