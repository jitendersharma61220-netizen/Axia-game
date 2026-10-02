#!/usr/bin/env bash
# Nightly Postgres backup with 14-day retention. Run from the repo root, e.g. via cron:
#   15 3 * * * cd /opt/axia && ./deploy/backup.sh >> deploy/backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p deploy/backups
file="deploy/backups/axia-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T postgres \
  pg_dump -U axia --no-owner axia | gzip > "$file"
find deploy/backups -name 'axia-*.sql.gz' -mtime +14 -delete
echo "$(date -Is) backup written: $file ($(du -h "$file" | cut -f1))"
