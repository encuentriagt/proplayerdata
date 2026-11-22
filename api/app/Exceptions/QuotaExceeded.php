<?php

namespace App\Exceptions;

use App\Support\ApiError;
use Exception;
use Illuminate\Http\JsonResponse;

class QuotaExceeded extends Exception
{
    public function __construct(public string $plan, public int $quota)
    {
        parent::__construct("Cupo de plan $plan agotado ($quota).");
    }

    /** No es un error del sistema: no se registra en el log. */
    public function report(): bool
    {
        return true;
    }

    public function render(): JsonResponse
    {
        $label = $this->plan === 'premium' ? 'Premium' : 'Pro';

        return ApiError::response('quota_exceeded', "Ya usó todos los planes {$label} disponibles ({$this->quota}).", 422, ['plan' => $this->plan, 'quota' => $this->quota]);
    }
}
