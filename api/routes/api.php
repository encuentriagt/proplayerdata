<?php

use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Public\BrandingController;
use App\Http\Controllers\Public\HealthController;
use App\Http\Controllers\Files\PlayerPhotoController;
use App\Http\Controllers\Me\MeController;
use App\Http\Controllers\Pc\CatalogController;
use App\Http\Controllers\Pc\EventController;
use App\Http\Controllers\Pc\InvitationController;
use App\Http\Controllers\Public\InvitationAcceptController;
use App\Http\Controllers\Pc\MemberController;
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

    Route::middleware(['auth:sanctum', 'active', 'throttle:api'])->group(function () {
        Route::get('me', [AuthController::class, 'me'])->name('auth.me');
        Route::post('logout', [AuthController::class, 'logout'])->name('auth.logout');
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

    // ---- PC: Plataforma Coach (coach, director, org_admin) ----
    Route::prefix('pc/orgs/{organization:slug}')->middleware('org')->scopeBindings()->group(function () {
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
        Route::put('events/{event}/callups', [EventController::class, 'callups'])->middleware('idempotent');
        Route::put('events/{event}/attendance', [EventController::class, 'attendance'])->middleware('idempotent');
        Route::put('events/{event}/match-sheet', [EventController::class, 'matchSheet'])->middleware('idempotent');

        Route::get('invitations', [InvitationController::class, 'index']);
        Route::post('invitations', [InvitationController::class, 'store'])->middleware(['throttle:invites', 'idempotent']);
        Route::delete('invitations/{invitation}', [InvitationController::class, 'destroy']);

        Route::get('members', [MemberController::class, 'index']);
        Route::patch('members/{member}', [MemberController::class, 'update']);
        Route::delete('members/{member}', [MemberController::class, 'destroy']);
    });
});
