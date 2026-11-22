<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SportPosition extends Model
{
    protected $fillable = ['sport_id', 'code', 'name', 'sort'];

    public function sport(): BelongsTo
    {
        return $this->belongsTo(Sport::class);
    }
}
