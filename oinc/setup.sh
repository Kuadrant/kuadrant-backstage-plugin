#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "${1:-}" in
  --cluster) exec "${SCRIPT_DIR}/setup-cluster.sh" ;;
  --dex)     exec "${SCRIPT_DIR}/setup-dex.sh" ;;
  --rhdh)    exec "${SCRIPT_DIR}/setup-rhdh.sh" ;;
  *)
    "${SCRIPT_DIR}/setup-cluster.sh"
    # setup-rhdh owns Dex so this and `yarn oinc:rhdh` cannot diverge.
    "${SCRIPT_DIR}/setup-rhdh.sh"
    ;;
esac
