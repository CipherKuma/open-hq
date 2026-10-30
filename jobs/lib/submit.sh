#!/usr/bin/env bash
# Shared launcher: source this from jobs/<name>/run.sh after setting
#   JOB_BASE IMAGE PLATFORM PRESET CMD ARGS TIMEOUT and arrays INJECTS (local:container) EXTRA_ENV (KEY=VAL).
# Always uses the hackathon-jobs-sa profile. Secrets come from the vault and are never printed.
# MysteryBox --env-secret is denied for this service account (payload not readable by the job runtime),
# so keys travel as --env values; the job is deleted once finished (KEEP=1 to keep it).
set -euo pipefail
NB=(nebius --profile hackathon-jobs-sa)
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOBS_DIR="$(dirname "$LIB_DIR")"
strip() { sed 's/\x1b\[[0-9;]*m//g'; }

submit_job() {
  local tmp name id state out rc=0
  tmp="$(mktemp -d)"
  "$HOME/.claude/vault/inject.sh" get NEBIUS_API_KEY --dir "$tmp" >/dev/null
  # INGEST_SECRET lives in a mode-600 file (not the vault); read into the environment, never printed.
  INGEST_FILE="${INGEST_SECRET_FILE:-$HOME/.config/openhq/ingest_secret}"
  if [ -r "$INGEST_FILE" ]; then INGEST_SECRET="$(tr -d '\r\n' < "$INGEST_FILE")"; export INGEST_SECRET
  else echo "note: no ingest secret file; job will print its result JSON to stdout" >&2; fi
  set -a; . "$tmp/.env.local"; set +a   # NEBIUS_API_KEY
  rm -f "$tmp/.env.local"
  name="openhq-${JOB_BASE}-$(date +%H%M%S)"
  local args=(ai job create --name "$name" --image "$IMAGE" --platform "$PLATFORM" --preset "$PRESET"
              --timeout "${TIMEOUT:-1h}" --async --format json
              --env "NEBIUS_API_KEY=$NEBIUS_API_KEY"
              --container-command "$CMD" --args "$ARGS")
  [ -n "${INGEST_SECRET:-}" ] && args+=(--env "INGEST_SECRET=$INGEST_SECRET")
  [ -n "${OPENHQ_URL:-}" ] && args+=(--env "OPENHQ_URL=$OPENHQ_URL")
  for e in "${EXTRA_ENV[@]:-}"; do [ -n "$e" ] && args+=(--env "$e"); done
  for f in "${INJECTS[@]}"; do args+=(--inject-file "$f"); done
  local resp; resp="$("${NB[@]}" "${args[@]}" 2>"$tmp/err" | strip || true)"
  id="$(printf '%s' "$resp" | python3 -c 'import sys,json;t=sys.stdin.read();print(json.loads(t[t.find("{"):])["resource_id"])' 2>/dev/null || true)"
  if [ -z "$id" ]; then echo "job create failed:" >&2; grep -iE "error|denied|quota|invalid" "$tmp/err" | strip | head -5 >&2; rm -rf "$tmp"; return 1; fi
  echo "created $name -> $id" >&2
  while :; do
    state="$("${NB[@]}" ai job get "$id" --format 'jsonpath={.status.state}' 2>/dev/null | strip | tail -1 || true)"
    echo "state: $state" >&2
    case "$state" in COMPLETED|FAILED|ERROR|CANCELLED) break ;; esac
    sleep 15
  done
  "${NB[@]}" ai job logs "$id" --since 3h 2>&1 | strip
  [ "$state" = COMPLETED ] || rc=1
  if [ "${KEEP:-0}" != 1 ]; then "${NB[@]}" ai job delete "$id" >/dev/null 2>&1 && echo "deleted $id" >&2; fi
  rm -rf "$tmp"; return $rc
}
