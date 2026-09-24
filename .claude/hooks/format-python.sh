#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit): ruff-format and autofix Python files after Claude edits them.
set -uo pipefail
path=$(jq -r '.tool_input.file_path // empty')
case "$path" in *.py) ;; *) exit 0 ;; esac
[ -f "$path" ] || exit 0

if command -v micromamba >/dev/null 2>&1; then
  run=(micromamba run -n atom-sim ruff)
elif command -v ruff >/dev/null 2>&1; then
  run=(ruff)
else
  exit 0
fi
"${run[@]}" format --quiet "$path" >/dev/null 2>&1
# Report remaining lint problems back to Claude (exit 2 → shown as feedback, edit already applied).
if ! out=$("${run[@]}" check --fix --quiet "$path" 2>&1); then
  echo "ruff found issues in $path:" >&2
  echo "$out" >&2
  exit 2
fi
exit 0
