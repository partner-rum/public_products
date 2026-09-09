#!/bin/sh
# Ежедневная копия базы бэкенда.
#
# Почему sqlite3 .backup, а не cp: база работает в режиме WAL, и простое
# копирование файла под записью даёт битый слепок. .backup снимает целостную
# копию на живой базе.
#
# Запуск: /srv/site/server/backup.sh [база] [каталог копий]
set -eu
DB="${1:-/var/lib/rumberg/kv.db}"
DIR="${2:-/var/backups/rumberg}"
KEEP="${KEEP:-14}"

mkdir -p "$DIR"
STAMP="$(date +%Y%m%d-%H%M)"
OUT="$DIR/kv-$STAMP.db"
sqlite3 "$DB" ".backup '$OUT'"
gzip -f "$OUT"

# Держим KEEP последних копий, остальное чистим.
ls -1t "$DIR"/kv-*.db.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "бэкап готов: $OUT.gz"
