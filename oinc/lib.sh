#!/usr/bin/env bash
# shared helpers for oinc cluster scripts

log() { echo "==> $*"; }

check_command() {
  if ! command -v "$1" &>/dev/null; then
    echo "error: '$1' not found. $2"
    exit 1
  fi
}
