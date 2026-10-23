#!/bin/bash
set -euo pipefail
: "${POSTGRES_USER:?POSTGRES_USER must be provided by the service environment}"
: "${POSTGRES_DB:?POSTGRES_DB must be provided by the service environment}"
umask 077
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
output="/opt/pagehush/backups/postgres/pagehush-${timestamp}.sql.gz"
tmp=$(mktemp "${output}.XXXXXX")
trap 'rm -f "$tmp"' EXIT
docker exec pagehush-services-postgres-1 pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip -9 > "$tmp"
gzip -t "$tmp"
mv "$tmp" "$output"
find /opt/pagehush/backups/postgres -type f -name 'pagehush-*.sql.gz' -mtime +13 -delete
printf 'PostgreSQL backup created: %s\n' "$output"
