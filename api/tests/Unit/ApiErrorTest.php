<?php

namespace Tests\Unit;

use App\Support\ApiError;
use Tests\TestCase;

class ApiErrorTest extends TestCase
{
    public function test_formato_de_error(): void
    {
        $r = ApiError::response('codigo', 'Mensaje', 418, ['extra' => 1]);
        $this->assertSame(418, $r->getStatusCode());
        $this->assertSame(['error' => ['code' => 'codigo', 'message' => 'Mensaje', 'extra' => 1]], $r->getData(true));
    }
}
