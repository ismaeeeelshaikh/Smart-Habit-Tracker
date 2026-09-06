#!/usr/bin/env sh
# Daily Postgres backup (TRD Section 8.5).
#
# This app holds people's schedules and habit history; losing it is a
# trust-breaking failure, not an inconvenience. So: dump daily, keep 14 days,
# and push off-host, because a backup sitting on the same VPS does not survive
# the failure it exists for.
#
# Install on the host, not in a container:
#   0 3 * * *  /opt/smart-habit-tracker/docker/backup.sh >> /var/log/sht-backup.log 2>&1
#
# Environment:
#   BACKUP_DIR       local staging dir            (default /var/backups/sht)
#   RETENTION_DAYS   how long to keep             (default 14)
#   S3_TARGET        e.g. s3://bucket/sht         (optional; skipped if unset)
#   DB_CONTAINER     compose container name       (default time_intel_db)
set -eu

BACKUP_DIR="${BACKUP_DIR:-/var/backups/sht}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB_CONTAINER="${DB_CONTAINER:-time_intel_db}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-smart_habit_tracker}"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="${BACKUP_DIR}/${POSTGRES_DB}-${stamp}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] dumping ${POSTGRES_DB} from ${DB_CONTAINER}"
# --clean --if-exists so the dump can be restored over an existing database.
docker exec "$DB_CONTAINER" pg_dump \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --clean --if-exists \
  | gzip > "$archive"

# A dump that silently produced nothing is worse than no dump, because it looks
# like success. gzip of an empty stream is still ~20 bytes.
size=$(wc -c < "$archive")
if [ "$size" -lt 1000 ]; then
    echo "[backup] FAILED: ${archive} is only ${size} bytes" >&2
    rm -f "$archive"
    exit 1
fi
echo "[backup] wrote ${archive} (${size} bytes)"

if [ -n "${S3_TARGET:-}" ]; then
    echo "[backup] uploading to ${S3_TARGET}"
    aws s3 cp "$archive" "${S3_TARGET}/$(basename "$archive")"
else
    echo "[backup] S3_TARGET unset — keeping local copy only."
    echo "[backup] WARNING: a backup on the same host does not survive losing that host."
fi

echo "[backup] pruning local copies older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -name "${POSTGRES_DB}-*.sql.gz" -mtime "+${RETENTION_DAYS}" -print -delete

echo "[backup] done"
