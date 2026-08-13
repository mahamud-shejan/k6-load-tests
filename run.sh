#!/usr/bin/env bash
# Load credentials/tunables from .env and run k6 with the given arguments.
#
# k6 has no native .env support, so this loader reads the file and exports each
# KEY=value into the environment (k6 picks up system env vars by default). Values
# are taken literally — no shell expansion — so special characters in passwords
# (e.g. $ and !) are preserved.
#
# Usage:
#   ./run.sh tests/ops.test.js
#   ./run.sh -e MODE=level -e LEVEL=150 tests/worker.test.js
#   ENV_FILE=.env.staging ./run.sh tests/home.test.js
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"

if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    # skip blank lines and comments
    case "$line" in '' | '#'*) continue ;; esac
    key=${line%%=*}
    val=${line#*=}
    # trim surrounding whitespace on the key
    key=${key%%[[:space:]]}
    key=${key##[[:space:]]}
    # strip one layer of matching surrounding quotes, if present
    case "$val" in
      \"*\") val=${val#\"}; val=${val%\"} ;;
      \'*\') val=${val#\'}; val=${val%\'} ;;
    esac
    export "$key=$val"
  done < "$ENV_FILE"
else
  echo "run.sh: no '$ENV_FILE' found — copy .env.example to .env and fill it in." >&2
fi

exec k6 run "$@"
