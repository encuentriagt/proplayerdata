<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sport extends Model
{
    protected $fillable = ['code', 'name', 'periods', 'period_minutes', 'max_on_field', 'unlimited_substitutions', 'active', 'sort'];

    protected function casts(): array
    {
        return ['unlimited_substitutions' => 'boolean', 'active' => 'boolean', 'periods' => 'integer', 'period_minutes' => 'integer', 'max_on_field' => 'integer'];
    }

    public function positions(): HasMany
    {
        // Catálogo de ppd. Las de cada organización se leen con App\Support\Positions.
        return $this->hasMany(SportPosition::class)->whereNull('organization_id')->orderBy('sort');
    }

    public function statTypes(): HasMany
    {
        return $this->hasMany(SportStatType::class)->orderBy('sort');
    }

    public function payload(bool $withCatalog = true): array
    {
        $data = [
            'id' => $this->id, 'code' => $this->code, 'name' => $this->name,
            'periods' => $this->periods, 'period_minutes' => $this->period_minutes,
            'max_on_field' => $this->max_on_field, 'unlimited_substitutions' => $this->unlimited_substitutions,
        ];
        if ($withCatalog) {
            $data['positions'] = $this->positions->map(fn ($p) => ['id' => $p->id, 'code' => $p->code, 'name' => $p->name, 'sort' => $p->sort])->values()->all();
            $data['stat_types'] = $this->statTypes->map(fn ($s) => ['id' => $s->id, 'code' => $s->code, 'name' => $s->name, 'scores' => $s->scores])->all();
        }

        return $data;
    }
}
