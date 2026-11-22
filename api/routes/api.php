<?php

use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Public\BrandingController;
use App\Http\Controllers\Public\HealthController;
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
