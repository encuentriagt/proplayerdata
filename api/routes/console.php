<?php

/*
| Sin scheduler por minuto (docs/ARQUITECTURA.md, sección 16).
| El cron del servidor ejecuta directamente, una vez al día:
|   02:00  ops/backup.sh        respaldo de BD + archivos
|   03:10  php artisan ppd:maintenance   limpieza de datos vencidos
| Cuando exista el módulo de emergencias se agregará su tarea aquí.
*/
