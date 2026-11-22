<?php

namespace App\Services\Push;

interface PushSender
{
    /**
     * Envía una notificación a varios tokens FCM.
     *
     * @param  string[]  $tokens
     * @param  array<string,string>  $data  (solo strings: requisito de FCM)
     * @return array<string,string> token => ok | invalid | error
     */
    public function send(array $tokens, string $title, string $body, array $data = [], string $channel = 'general'): array;
}
