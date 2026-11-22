<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Season extends Model
{
    protected $fillable = ['organization_id', 'name', 'starts_on', 'ends_on', 'is_current'];

    protected function casts(): array
    {
        return ['starts_on' => 'date', 'ends_on' => 'date', 'is_current' => 'boolean'];
    }

    public function payload(): array
    {
        return [
            'id' => $this->id, 'name' => $this->name,
            'starts_on' => $this->starts_on?->toDateString(), 'ends_on' => $this->ends_on?->toDateString(),
            'is_current' => $this->is_current,
        ];
    }
}
