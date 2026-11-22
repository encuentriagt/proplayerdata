<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Device extends Model
{
    protected $fillable = ['user_id', 'platform', 'fcm_token', 'token_hash', 'last_seen_at'];

    protected $hidden = ['fcm_token', 'token_hash'];

    protected function casts(): array
    {
        return ['last_seen_at' => 'datetime'];
    }
}
