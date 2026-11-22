<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlanGrant extends Model
{
    protected $fillable = [
        'user_id', 'organization_id', 'plan', 'pro_player_id', 'pro_player_changed_at',
        'source', 'granted_by', 'starts_at', 'ends_at', 'revoked_at', 'note',
    ];

    protected function casts(): array
    {
        return ['starts_at' => 'datetime', 'ends_at' => 'datetime', 'revoked_at' => 'datetime', 'pro_player_changed_at' => 'datetime'];
    }

    public function scopeActive(Builder $q): Builder
    {
        return $q->whereNull('revoked_at')->where('starts_at', '<=', now())
            ->where(fn ($w) => $w->whereNull('ends_at')->orWhere('ends_at', '>', now()));
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function payload(): array
    {
        return [
            'id' => $this->id, 'user_id' => $this->user_id, 'plan' => $this->plan,
            'organization_id' => $this->organization_id, 'source' => $this->source,
            'pro_player_id' => $this->pro_player_id,
            'starts_at' => $this->starts_at?->toIso8601String(), 'ends_at' => $this->ends_at?->toIso8601String(),
            'revoked_at' => $this->revoked_at?->toIso8601String(), 'note' => $this->note,
        ];
    }
}
