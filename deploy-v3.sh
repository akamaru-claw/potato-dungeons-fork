#!/bin/bash
# Lädt v3/ per SFTP nach /public/potato-dungeons-fork/v3/ auf Strato.
#
#   bash deploy-v3.sh            # hochladen
#   bash deploy-v3.sh --dry-run  # nur zeigen, was passieren würde
#
# Das Passwort steht in .env.strato und gehört nicht ins Repo.

set -euo pipefail

HOST="570431591.ssh.w1.strato.hosting"
USER="stu343457240"
REMOTE="/public/potato-dungeons-fork/v3"
LOCAL="$(cd "$(dirname "$0")" && pwd)/v3"
ENV_FILE="$(dirname "$0")/.env.strato"

[ -f "$ENV_FILE" ] || ENV_FILE="/home/jordy/.openclaw/workspace/.env.strato"
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi
PASS="${STRATO_SFTP_PASS:-}"
if [ -z "$PASS" ]; then
  echo "Fehler: STRATO_SFTP_PASS nicht gesetzt (erwartet in .env.strato)." >&2
  exit 1
fi

# dev/ bleibt lokal — Testwerkzeuge gehören nicht auf den Webserver.
FILES=$(cd "$LOCAL" && find . -type f -not -path './dev/*' | sed 's|^\./||' | sort)
DIRS=$(printf '%s\n' "$FILES" | xargs -n1 dirname | sort -u | grep -v '^\.$' || true)

BATCH=$(mktemp)
trap 'rm -f "$BATCH"' EXIT

# -mkdir scheitert still, wenn das Verzeichnis schon existiert — genau richtig.
{
  echo "-mkdir $REMOTE"
  for d in $DIRS; do echo "-mkdir $REMOTE/$d"; done
  for f in $FILES; do echo "put \"$LOCAL/$f\" \"$REMOTE/$f\""; done
  echo "bye"
} > "$BATCH"

COUNT=$(printf '%s\n' "$FILES" | wc -l | tr -d ' ')
echo "v3 → $HOST:$REMOTE  ($COUNT Dateien)"

if [ "${1:-}" = "--dry-run" ]; then
  echo "--- Testlauf, es wird nichts übertragen ---"
  cat "$BATCH"
  exit 0
fi

sshpass -p "$PASS" sftp -oBatchMode=no -oStrictHostKeyChecking=accept-new \
  -b "$BATCH" "$USER@$HOST" > /tmp/strato-v3-upload.log 2>&1 || {
    echo "Upload fehlgeschlagen. Letzte Zeilen:" >&2
    tail -20 /tmp/strato-v3-upload.log >&2
    exit 1
  }

echo "Fertig. https://ml-bets.com/potato-dungeons-fork/v3/"
