#!/usr/bin/env bash
# waits for the kuadrant demo apiproducts to be ingested into the backstage
# catalog before the dynamic-plugin e2e specs run.
#
# the apiproduct entity provider syncs on a periodic schedule, so the catalog is
# empty for a short window after the backend starts. the auth-scheme specs have
# positive asserts on these entities (e.g. /catalog/default/api/toystore-api);
# without this gate they race the first sync and flake. the frontend readiness
# curl on the route does not cover catalog content.
#
# entities are given as kind/namespace/name and default to the two the positive
# specs depend on. guest is a superuser here, so catalog reads need its bearer
# token.
set -euo pipefail

BASE_URL="${BASE_URL:-http://rhdh.localhost:9080}"
TIMEOUT="${CATALOG_TIMEOUT:-120}"

if [ "$#" -gt 0 ]; then
  ENTITIES=("$@")
else
  ENTITIES=(api/default/toystore-api api/default/gamestore-admin)
fi

log() { echo ">> $*"; }

get_guest_token() {
  curl -fsS -X POST "${BASE_URL}/api/auth/guest/refresh" 2>/dev/null |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["backstageIdentity"]["token"])' 2>/dev/null
}

entity_present() {
  local token="$1" ref="$2" code
  code=$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${token}" \
    "${BASE_URL}/api/catalog/entities/by-name/${ref}" 2>/dev/null || true)
  [ "${code}" = "200" ]
}

dump_catalog_apis() {
  local token="$1"
  log "catalog api entities currently present:"
  curl -sS -H "Authorization: Bearer ${token}" \
    "${BASE_URL}/api/catalog/entities/by-query?filter=kind%3Dapi&limit=100" 2>/dev/null |
    python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    items = d.get("items", d if isinstance(d, list) else [])
    if not items:
        print("  (none)")
    for e in items:
        m = e.get("metadata", {})
        ns = m.get("namespace")
        nm = m.get("name")
        print(f"  - {ns}/{nm}")
except Exception as ex:
    print(f"  (could not parse catalog response: {ex})")' 2>/dev/null ||
    log "  (catalog query failed)"
}

log "waiting up to ${TIMEOUT}s for catalog entities: ${ENTITIES[*]}"
deadline=$(($(date +%s) + TIMEOUT))
while true; do
  token="$(get_guest_token || true)"
  missing=()
  if [ -n "${token}" ]; then
    for ref in "${ENTITIES[@]}"; do
      entity_present "${token}" "${ref}" || missing+=("${ref}")
    done
    if [ "${#missing[@]}" -eq 0 ]; then
      log "all catalog entities present: ${ENTITIES[*]}"
      exit 0
    fi
  else
    missing=("(no guest token yet)")
  fi

  if [ "$(date +%s)" -ge "${deadline}" ]; then
    log "error: timed out after ${TIMEOUT}s waiting for catalog entities"
    log "still missing: ${missing[*]}"
    dump_catalog_apis "${token:-}"
    exit 1
  fi
  sleep 3
done
