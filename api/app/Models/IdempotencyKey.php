<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IdempotencyKey extends Model
{
    protected $fillable = [
        'scope', 'idempotency_key', 'method', 'path', 'request_hash', 'status',
        'response_code', 'response_body', 'response_content_type', 'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'response_body' => 'encrypted',
            'response_code' => 'integer',
            'expires_at' => 'datetime',
        ];
    }
}
