#!/usr/bin/env bash
# shared helpers for oinc cluster scripts

log() { echo "==> $*"; }

detect_runtime() {
  # Prefer the Docker CLI (including OrbStack), matching oinc's runtime
  # detection and kuadrant-console-plugin/scripts/lib.sh.
  if command -v docker &>/dev/null; then
    echo "docker"
  elif command -v podman &>/dev/null; then
    echo "podman"
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
