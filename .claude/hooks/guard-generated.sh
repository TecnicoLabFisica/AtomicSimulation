#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit): block hand edits to generated artifacts and PDFs in the repo.
set -euo pipefail
path=$(jq -r '.tool_input.file_path // empty')
[ -z "$path" ] && exit 0
rel=${path#"${CLAUDE_PROJECT_DIR:-$PWD}/"}

case "$rel" in
  artifacts/*)
    echo "Blocked: artifacts/ is generated. Change the Python model (model/src/braggsim) and run" \
         "'micromamba run -n atom-sim python model/scripts/export_artifacts.py' instead." >&2
    exit 2 ;;
  *.pdf)
    echo "Blocked: PDFs must not be written into the repo (LD Didactic copyright; refs/ is local-only)." >&2
    exit 2 ;;
esac
exit 0
