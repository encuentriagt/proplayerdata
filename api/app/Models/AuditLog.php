<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    protected $table = 'audit_log';

    public const UPDATED_AT = null;

    protected $fillable = [
        'actor_user_id', 'organization_id', 'action', 'target_type', 'target_id', 'data', 'ip', 'user_agent',
    ];

    protected function casts(): array
    {
        return ['data' => 'array'];
    }
}
