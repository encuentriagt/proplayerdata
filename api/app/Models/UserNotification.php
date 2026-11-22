<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserNotification extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'organization_id', 'player_id', 'kind', 'title', 'body', 'data', 'read_at'];

    protected function casts(): array
    {
        return ['data' => 'array', 'read_at' => 'datetime'];
    }

    public function payload(): array
    {
        return [
            'id' => $this->id, 'kind' => $this->kind, 'title' => $this->title, 'body' => $this->body,
            'data' => $this->data, 'organization_id' => $this->organization_id, 'player_id' => $this->player_id,
            'read' => $this->read_at !== null, 'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
