<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    // Campos sensibles (is_super_admin, totp, apple, bloqueo) NO son asignables en masa: se usan con forceFill.
    protected $fillable = ['name', 'email', 'phone', 'password'];

    protected $hidden = [
        'password', 'remember_token', 'totp_secret', 'apple_refresh_token', 'google_sub', 'apple_sub',
        'failed_logins', 'locked_until',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_super_admin' => 'boolean',
            'must_change_password' => 'boolean',
            'totp_secret' => 'encrypted',
            'totp_confirmed_at' => 'datetime',
            'apple_refresh_token' => 'encrypted',
            'failed_logins' => 'integer',
            'locked_until' => 'datetime',
            'last_login_at' => 'datetime',
        ];
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(OrganizationMember::class);
    }

    /** Hijos (jugadores) de los que este usuario es padre o encargado. */
    public function children(): BelongsToMany
    {
        return $this->belongsToMany(Player::class, 'guardian_players')->withPivot(['relationship', 'verified_at'])->withTimestamps();
    }

    public function staffTeams(): HasMany
    {
        return $this->hasMany(TeamStaff::class);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }
}
