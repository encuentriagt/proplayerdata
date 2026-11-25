<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/** organization_id NULL = catálogo de ppd; con valor = lista editable de esa organización. */
class SportPosition extends Model
{
    use SoftDeletes;

    protected $fillable = ['sport_id', 'organization_id', 'code', 'name', 'sort'];

    public function sport(): BelongsTo
    {
        return $this->belongsTo(Sport::class);
    }

    public function payload(): array
    {
        return ['id' => $this->id, 'code' => $this->code, 'name' => $this->name, 'sort' => $this->sort];
    }
}
