#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

# ci teardown runs on always(); a failed oinc install must not fail the job here.
# also covers local runs before oinc is installed.
if ! command -v oinc &>/dev/null; then
  log "oinc not installed, nothing to tear down"
  exit 0
fi

log "deleting oinc cluster..."
oinc delete --force

log "teardown complete"
