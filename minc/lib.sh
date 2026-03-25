#!/usr/bin/env bash
# shared helpers for minc scripts

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

wait_for_api() {
  log "waiting for API server..."
  local retries=60
  while ! kubectl get nodes &>/dev/null; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      echo "error: API server not ready after 120s"
      exit 1
    fi
    sleep 2
  done
  log "API server ready"
}

wait_for_node() {
  log "waiting for node Ready..."
  local retries=60
  while true; do
    local status
    status=$(kubectl get nodes -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
    if [ "${status}" = "True" ]; then
      break
    fi
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      echo "error: node not Ready after 300s"
      kubectl describe node 2>&1 | tail -10
      exit 1
    fi
    sleep 5
  done
  log "node Ready"
}
