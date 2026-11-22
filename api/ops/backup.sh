#!/bin/bash
# Respaldo diario de ppd (BD + archivos + .env). Lo ejecuta el cron a las 2:00 a. m.
# Copia la idea de ~/trafidocback/backup.sh: credenciales en archivo temporal 600 (nunca en la línea de comandos),
# zip 600 en carpeta 700 fuera del document root, rotación de 7 días.
set -euo pipefail
umask 077

API="$HOME/ppd-api"
DEST="$HOME/ppdback/daily"
KEEP=7
STAMP=$(date +%Y%m%d-%H%M)
LOG="$DEST/backup.log"

mkdir -p "$DEST"; chmod 700 "$HOME/ppdback" "$DEST"
cd "$API"

val(){ grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }
DB=$(val DB_DATABASE); U=$(val DB_USERNAME); P=$(val DB_PASSWORD)

WORK=$(mktemp -d "$DEST/tmp.XXXXXX")
CNF="$WORK/my.cnf"
trap 'rm -rf "$WORK"' EXIT
printf '[client]\nuser=%s\npassword=%s\n' "$U" "$P" > "$CNF"

mysqldump --defaults-extra-file="$CNF" --single-transaction --routines --triggers --no-tablespaces "$DB" > "$WORK/db.sql"
rm -f "$CNF"
cp -p .env "$WORK/env"
tar -czf "$DEST/ppd-$STAMP.tar.gz" -C "$WORK" db.sql env -C "$API" storage/app
chmod 600 "$DEST/ppd-$STAMP.tar.gz"

# Rotación: conservar los últimos $KEEP
ls -1t "$DEST"/ppd-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "$(date '+%F %T') OK ppd-$STAMP.tar.gz $(du -h "$DEST/ppd-$STAMP.tar.gz" | cut -f1)" >> "$LOG"
tail -n 60 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
