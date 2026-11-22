<?php

namespace App\Services;

use App\Models\Organization;
use App\Models\PlanGrant;
use App\Models\Player;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** Un solo lugar decide el plan de un padre (idea de Trafidoc: premium_grants). */
final class PlanService
{
    /** Grant vigente de mayor nivel (premium > pro) o null (Gratis). */
    public function activeGrant(User $user): ?PlanGrant
    {
        return PlanGrant::active()->where('user_id', $user->id)
            ->orderByRaw("CASE plan WHEN 'premium' THEN 0 ELSE 1 END")
            ->orderByDesc('id')->first();
    }

    /** Nivel efectivo para un hijo concreto. */
    public function levelFor(User $user, Player $player, ?PlanGrant $grant = null): string
    {
        $grant ??= $this->activeGrant($user);
        if (! $grant) {
            return 'free';
        }
        if ($grant->plan === 'premium') {
            return 'premium';
        }

        return $grant->pro_player_id === $player->id ? 'pro' : 'free';
    }

    public function limits(string $level): array
    {
        return config("plans.levels.$level");
    }

    /**
     * Asigna un plan. Si ya tiene uno igual vigente desde la misma organización, lo devuelve (idempotente).
     * Si consume cupo de la organización, verifica el cupo con bloqueo de fila.
     */
    public function grant(User $user, string $plan, ?Organization $org, string $source, ?User $by, ?\DateTimeInterface $endsAt = null, ?string $note = null): PlanGrant
    {
        return DB::transaction(function () use ($user, $plan, $org, $source, $by, $endsAt, $note) {
            if ($org) {
                $lockedOrg = Organization::whereKey($org->id)->lockForUpdate()->first();
                $existing = PlanGrant::active()->where('user_id', $user->id)->where('organization_id', $org->id)->where('plan', $plan)->first();
                if ($existing) {
                    return $existing;
                }
                $used = PlanGrant::active()->where('organization_id', $org->id)->where('plan', $plan)->count();
                $quota = $plan === 'premium' ? $lockedOrg->quota_premium : $lockedOrg->quota_pro;
                if ($used >= $quota) {
                    throw new \App\Exceptions\QuotaExceeded($plan, $quota);
                }
            }

            // Pro: si tiene un solo hijo, se elige automáticamente.
            $proPlayer = null;
            if ($plan === 'pro') {
                $children = $user->children()->pluck('players.id');
                $proPlayer = $children->count() === 1 ? $children->first() : null;
            }

            return PlanGrant::create([
                'user_id' => $user->id, 'organization_id' => $org?->id, 'plan' => $plan,
                'pro_player_id' => $proPlayer, 'source' => $source, 'granted_by' => $by?->id,
                'starts_at' => now(), 'ends_at' => $endsAt, 'note' => $note,
            ]);
        });
    }

    public function usage(Organization $org): array
    {
        $count = fn ($plan) => PlanGrant::active()->where('organization_id', $org->id)->where('plan', $plan)->count();

        return [
            'pro' => ['quota' => $org->quota_pro, 'used' => $count('pro')],
            'premium' => ['quota' => $org->quota_premium, 'used' => $count('premium')],
        ];
    }
}
