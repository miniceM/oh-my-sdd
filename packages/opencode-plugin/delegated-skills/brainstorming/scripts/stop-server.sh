#!/usr/bin/env bash
# Stop the brainstorm server and clean up
# Usage: stop-server.sh <session_dir>
#
# Kills the server process. Only deletes session directories created directly
# under the configured temporary root. Persistent directories (.superpowers/) are
# kept so mockups can be reviewed later.

SESSION_DIR="${1:-}"

if [[ -z "$SESSION_DIR" ]]; then
  echo '{"error": "Usage: stop-server.sh <session_dir>"}'
  exit 1
fi

if ! SESSION_DIR="$(cd -- "$SESSION_DIR" 2>/dev/null && pwd -P)"; then
  echo '{"status": "refused", "error": "session directory does not exist"}'
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
EXPECTED_SERVER="${SCRIPT_DIR}/server.cjs"
STATE_DIR="${SESSION_DIR}/state"
PID_FILE="${STATE_DIR}/server.pid"
IDENTITY_FILE="${STATE_DIR}/server.script"

if [[ -f "$PID_FILE" ]]; then
  if [[ -L "$PID_FILE" || -L "$IDENTITY_FILE" || ! -f "$IDENTITY_FILE" ]]; then
    echo '{"status": "refused", "error": "invalid server identity files"}'
    exit 1
  fi

  pid="$(cat "$PID_FILE")"
  recorded_server="$(cat "$IDENTITY_FILE")"
  if [[ ! "$pid" =~ ^[0-9]+$ || "$pid" -le 1 || "$recorded_server" != "$EXPECTED_SERVER" ]]; then
    echo '{"status": "refused", "error": "invalid server identity"}'
    exit 1
  fi

  process_command="$(ps -ww -o command= -p "$pid" 2>/dev/null || true)"
  if [[ "$process_command" != *"$EXPECTED_SERVER"* ]]; then
    echo '{"status": "refused", "error": "pid does not belong to this brainstorm server"}'
    exit 1
  fi

  # Try to stop gracefully, fallback to force if still alive
  kill "$pid" 2>/dev/null || true

  # Wait for graceful shutdown (up to ~2s)
  for i in {1..20}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 0.1
  done

  # If still running, escalate to SIGKILL
  if kill -0 "$pid" 2>/dev/null; then
    process_command="$(ps -ww -o command= -p "$pid" 2>/dev/null || true)"
    if [[ "$process_command" != *"$EXPECTED_SERVER"* ]]; then
      echo '{"status": "refused", "error": "pid identity changed while stopping"}'
      exit 1
    fi
    kill -9 "$pid" 2>/dev/null || true

    # Give SIGKILL a moment to take effect
    sleep 0.1
  fi

  if kill -0 "$pid" 2>/dev/null; then
    echo '{"status": "failed", "error": "process still running"}'
    exit 1
  fi

  rm -f -- "$PID_FILE" "$IDENTITY_FILE" "${STATE_DIR}/server.log"

  # Delete only canonical direct children created by start-server.sh.
  TMP_ROOT="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
  SESSION_PARENT="$(dirname -- "$SESSION_DIR")"
  SESSION_BASENAME="$(basename -- "$SESSION_DIR")"
  if [[ "$SESSION_PARENT" == "$TMP_ROOT" && "$SESSION_BASENAME" =~ ^brainstorm-([0-9]+-[0-9]+|[[:alnum:]]{8})$ ]]; then
    rm -rf -- "$SESSION_DIR"
  fi

  echo '{"status": "stopped"}'
else
  echo '{"status": "not_running"}'
fi
