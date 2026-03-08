#!/bin/sh
set -eu

APP_DIR="/app"
DB_FILE="/data/database/media.db"
BACKUP_DIR="/data/database/backups"

echo "[entrypoint] Старт контейнера..."

# 1. Резервное копирование БД перед миграциями (если файл существует)
if [ -f "$DB_FILE" ]; then
  mkdir -p "$BACKUP_DIR"
  TS="$(date +%Y%m%d-%H%M%S)"
  BACKUP_FILE="$BACKUP_DIR/media.db.$TS.bak"
  echo "[entrypoint] Резервное копирование БД: $DB_FILE -> $BACKUP_FILE"
  cp "$DB_FILE" "$BACKUP_FILE"
else
  echo "[entrypoint] Файл БД не найден ($DB_FILE). Бэкап пропущен."
fi

# 2. Накатываем миграции Prisma
echo "[entrypoint] Выполняю prisma migrate deploy..."
cd "$APP_DIR" && npx prisma migrate deploy

echo "[entrypoint] Миграции применены. Запускаю приложение..."
# 3. Старт приложения
exec node server.js
