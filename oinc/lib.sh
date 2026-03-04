#!/usr/bin/env bash
# shared helpers for oinc cluster scripts

log() { echo "==> $*"; }

detect_runtime() {
  if command -v podman &>/dev/null; then
    echo "podman"
  elif command -v docker &>/dev/null; then
    echo "docker"
  else
    echo "error: no container runtime found (need podman or docker)"
    exit 1
  fi
}

check_command() {
  if ! command -v "$1" &>/dev/null; then
    echo "error: '$1' not found. $2"
    exit 1
  fi
}
