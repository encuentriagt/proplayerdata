<?php

use App\Http\Controllers\Admin\AuditAdminController;
use App\Http\Controllers\Admin\OrganizationAdminController;
use App\Http\Controllers\Admin\PlanAdminController;
use App\Http\Controllers\Admin\SportAdminController;
use App\Http\Controllers\App\AccountController;
use App\Http\Controllers\App\ChildController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\PasswordResetController;
use App\Http\Controllers\Auth\TotpController;
use App\Http\Controllers\Public\BrandingController;
use App\Http\Controllers\Public\HealthController;
use App\Http\Controllers\Files\PlayerPhotoController;
use App\Http\Controllers\Me\MeController;
use App\Http\Controllers\Pc\BrandingController as PcBrandingController;
use App\Http\Controllers\Pc\CatalogController;
use App\Http\Controllers\Pc\EventController;
use App\Http\Controllers\Pc\InvitationController;
use App\Http\Controllers\Public\InvitationAcceptController;
use App\Http\Controllers\Pc\MemberController;
use App\Http\Controllers\Pc\PlanController;
use App\Http\Controllers\Pc\PlayerController;
use App\Http\Controllers\Pc\RosterController;
use App\Http\Controllers\Pc\SeasonController;
use App\Http\Controllers\Pc\TeamController;
use App\Http\Controllers\Pc\TeamStaffController;
use Illuminate\Support\Facades\Route;

/*
| Rutas de la API de ppd. Prefijos (docs/ARQUITECTURA.md, sección 7):
|   /api/public/*  sin sesión
|   /api/auth/*    login / sesión
|   /api/pc/*      coach, director, org_admin
|   /api/app/*     padres
|   /api/admin/*   super admin
*/

Route::prefix('public')->middleware('throttle:public')->group(function () {
    Route::get('health', HealthController::class);
    Route::get('orgs/{slug}/branding', BrandingController::class);
    Route::get('invitations/{token}', [InvitationAcceptController::class, 'show'])->middleware('throttle:codes');
    Route::post('invitations/{token}/accept', [InvitationAcceptController::class, 'accept'])->middleware(['throttle:codes', 'idempotent']);
});

Route::prefix('auth')->group(function () {
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login')->name('auth.login');
    Route::post('password/forgot', [PasswordResetController::class, 'forgot'])->middleware('throttle:codes');
    Route::get('password/reset/{token}', [PasswordResetController::class, 'show'])->middleware('throttle:codes');
    Route::post('password/reset', [PasswordResetController::class, 'reset'])->middleware(['throttle:codes', 'idempotent']);

    Route::middleware(['auth:sanctum', 'active', 'throttle:api'])->group(function () {
        Route::get('me', [AuthController::class, 'me'])->name('auth.me');
        Route::post('logout', [AuthController::class, 'logout'])->name('auth.logout');
        Route::post('totp/setup', [TotpController::class, 'setup']);
        Route::post('totp/confirm', [TotpController::class, 'confirm'])->middleware('throttle:codes');
        Route::post('totp/verify', [TotpController::class, 'verify'])->middleware('throttle:codes');
        Route::post('password', [AuthController::class, 'changePassword'])
            ->middleware(['throttle:codes', 'idempotent'])->name('auth.password');
    });
});

// Archivos privados: solo con URL firmada y vigente (sin sesión).
Route::prefix('files')->middleware(['signed', 'throttle:public'])->group(function () {
    Route::get('players/{player}/photo', PlayerPhotoController::class)->name('files.player-photo');
});

Route::middleware(['auth:sanctum', 'active', 'throttle:api'])->group(function () {
    Route::get('catalog/sports', [CatalogController::class, 'sports']);

    // ---- Del usuario autenticado (cualquier rol) ----
    Route::post('me/devices', [MeController::class, 'registerDevice']);
    Route::delete('me/devices', [MeController::class, 'removeDevice']);
    Route::get('me/notifications', [MeController::class, 'notifications']);
    Route::post('me/notifications/read', [MeController::class, 'markRead']);

    // ---- App de padres ----
    Route::prefix('app')->group(function () {
        Route::get('children', [ChildController::class, 'index']);
        Route::get('children/{player}/events', [ChildController::class, 'events']);
        Route::get('children/{player}/events/{eventId}', [ChildController::class, 'event'])->whereNumber('eventId');
        Route::post('children/{player}/events/{eventId}/callup-response', [ChildController::class, 'respondCallup'])->whereNumber('eventId')->middleware('idempotent');
        Route::get('children/{player}/stats', [ChildController::class, 'stats']);
        Route::get('plan', [AccountController::class, 'plan']);
        Route::post('plan/pro-child', [AccountController::class, 'chooseProChild']);
        Route::delete('account', [AccountController::class, 'destroy'])->middleware('throttle:codes');
    });

    // ---- PC: Plataforma Coach (coach, director, org_admin) ----
    Route::prefix('pc/orgs/{organization:slug}')->middleware('org')->scopeBindings()->group(function () {
        Route::get('access', \App\Http\Controllers\Pc\AccessController::class);
        Route::get('sports', [\App\Http\Controllers\Pc\SportController::class, 'index']);
        Route::put('sports', [\App\Http\Controllers\Pc\SportController::class, 'update']);
        Route::post('sports/{sportId}/positions', [\App\Http\Controllers\Pc\PositionController::class, 'store'])->whereNumber('sportId')->middleware('idempotent');
        Route::patch('positions/{positionId}', [\App\Http\Controllers\Pc\PositionController::class, 'update'])->whereNumber('positionId');
        Route::delete('positions/{positionId}', [\App\Http\Controllers\Pc\PositionController::class, 'destroy'])->whereNumber('positionId');
        Route::get('seasons', [SeasonController::class, 'index']);
        Route::post('seasons', [SeasonController::class, 'store'])->middleware('idempotent');
        Route::patch('seasons/{season}', [SeasonController::class, 'update']);

        Route::get('teams', [TeamController::class, 'index']);
        Route::post('teams', [TeamController::class, 'store'])->middleware('idempotent');
        Route::get('teams/{team}', [TeamController::class, 'show']);
        Route::patch('teams/{team}', [TeamController::class, 'update']);
        Route::delete('teams/{team}', [TeamController::class, 'destroy']);

        Route::post('teams/{team}/staff', [TeamStaffController::class, 'store']);
        Route::delete('teams/{team}/staff/{userId}', [TeamStaffController::class, 'destroy'])->whereNumber('userId');

        Route::get('teams/{team}/roster', [RosterController::class, 'index']);
        Route::post('teams/{team}/roster', [RosterController::class, 'store']);
        Route::patch('teams/{team}/roster/{playerId}', [RosterController::class, 'update'])->whereNumber('playerId');
        Route::delete('teams/{team}/roster/{playerId}', [RosterController::class, 'destroy'])->whereNumber('playerId');

        Route::get('players', [PlayerController::class, 'index']);
        Route::post('players', [PlayerController::class, 'store'])->middleware('idempotent');
        Route::get('players/{player}', [PlayerController::class, 'show']);
        Route::patch('players/{player}', [PlayerController::class, 'update']);
        Route::delete('players/{player}', [PlayerController::class, 'destroy']);
        Route::post('players/{player}/photo', [PlayerController::class, 'photo'])->middleware('throttle:codes');

        Route::get('events', [EventController::class, 'index']);
        Route::post('events', [EventController::class, 'store'])->middleware('idempotent');
        Route::get('events/{event}', [EventController::class, 'show']);
        Route::patch('events/{event}', [EventController::class, 'update']);
        Route::delete('events/{event}', [EventController::class, 'destroy']);
        Route::post('events/series', [EventController::class, 'series'])->middleware(['idempotent', 'throttle:invites']);
        Route::post('events/{event}/publish', [EventController::class, 'publish'])->middleware('idempotent');
        Route::put('events/{event}/callups', [EventController::class, 'callups'])->middleware('idempotent');
        Route::put('events/{event}/attendance', [EventController::class, 'attendance'])->middleware('idempotent');
        Route::put('events/{event}/match-sheet', [EventController::class, 'matchSheet'])->middleware('idempotent');

        Route::get('invitations', [InvitationController::class, 'index']);
        Route::post('invitations', [InvitationController::class, 'store'])->middleware(['throttle:invites', 'idempotent']);
        Route::post('invitations/{invitation}/resend', [InvitationController::class, 'resend'])->middleware(['throttle:invites', 'idempotent']);
        Route::delete('invitations/{invitation}', [InvitationController::class, 'destroy']);

        Route::get('plans', [PlanController::class, 'index']);
        Route::post('plans', [PlanController::class, 'store'])->middleware('idempotent');
        Route::delete('plans/{grant}', [PlanController::class, 'destroy'])->withoutScopedBindings();

        Route::patch('branding', [PcBrandingController::class, 'update']);
        Route::post('branding/{kind}', [PcBrandingController::class, 'image'])->whereIn('kind', ['logo', 'crest', 'cover'])->middleware('throttle:codes');

        Route::get('members', [MemberController::class, 'index']);
        Route::patch('members/{member}', [MemberController::class, 'update']);
        Route::put('members/{member}/scopes', [MemberController::class, 'scopes']);
        Route::post('members/{member}/reset-password', [MemberController::class, 'resetPassword'])->middleware('throttle:codes');
        Route::delete('members/{member}', [MemberController::class, 'destroy']);
    });
});

// ---- Panel de super admin (TOTP verificado en esta sesión) ----
Route::prefix('admin')->middleware(['auth:sanctum', 'active', 'superadmin', 'throttle:api'])->group(function () {
    Route::get('organizations', [OrganizationAdminController::class, 'index']);
    Route::post('organizations', [OrganizationAdminController::class, 'store'])->middleware('idempotent');
    Route::get('organizations/{organization}', [OrganizationAdminController::class, 'show']);
    Route::patch('organizations/{organization}', [OrganizationAdminController::class, 'update']);
    Route::post('organizations/{organization}/branding/{kind}', [OrganizationAdminController::class, 'branding'])->whereIn('kind', ['logo', 'crest', 'cover']);
    Route::post('organizations/{organization}/invitations', [OrganizationAdminController::class, 'invite'])->middleware('idempotent');
    Route::get('organizations/{organization}/members', [OrganizationAdminController::class, 'members']);

    Route::get('sports', [SportAdminController::class, 'index']);
    Route::post('sports', [SportAdminController::class, 'store']);
    Route::patch('sports/{sport}', [SportAdminController::class, 'update']);
    Route::post('sports/{sport}/positions', [SportAdminController::class, 'storePosition']);
    Route::patch('positions/{position}', [SportAdminController::class, 'updatePosition']);
    Route::post('sports/{sport}/stat-types', [SportAdminController::class, 'storeStatType']);
    Route::patch('stat-types/{statType}', [SportAdminController::class, 'updateStatType']);

    Route::get('plans', [PlanAdminController::class, 'index']);
    Route::post('plans', [PlanAdminController::class, 'store'])->middleware('idempotent');
    Route::delete('plans/{grant}', [PlanAdminController::class, 'destroy']);

    Route::get('audit', [AuditAdminController::class, 'index']);
});
