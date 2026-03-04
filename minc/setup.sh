#!/usr/bin/env bash
# MINC environment setup.
#
# usage:
#   ./minc/setup.sh              # full setup: cluster + RHDH
#   ./minc/setup.sh --cluster    # cluster only: kuadrant, gateway api, istio, metallb, demos
#   ./minc/setup.sh --rhdh       # RHDH only: install on existing cluster
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MODE="${1:-full}"

case "${MODE}" in
  --cluster)
    "${SCRIPT_DIR}/setup-cluster.sh"
    ;;
  --rhdh)
    "${SCRIPT_DIR}/setup-rhdh.sh"
    ;;
  full|"")
    "${SCRIPT_DIR}/setup-cluster.sh"
    "${SCRIPT_DIR}/setup-rhdh.sh"
    ;;
  *)
    echo "usage: $0 [--cluster|--rhdh]"
    echo ""
    echo "  (no args)   full setup: cluster + RHDH"
    echo "  --cluster   cluster only (kuadrant, gateway api, istio, metallb, demos)"
    echo "  --rhdh      RHDH only (on existing cluster)"
    exit 1
    ;;
esac
