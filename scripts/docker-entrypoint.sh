#!/bin/sh
set -eu

echo "→ Menjalankan migrasi database…"
pnpm db:deploy

if [ "${SEED_DEMO:-true}" = "true" ] && [ ! -f /data/.seeded ]; then
  echo "→ Seed data demo pertama kali…"
  pnpm db:seed
  touch /data/.seeded
fi

echo "→ SIGAP API siap di port ${PORT:-3000}"
exec "$@"
