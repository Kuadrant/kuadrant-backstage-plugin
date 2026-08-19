#!/bin/bash
set -e

# check if dex web files already exist
if [ -f kuadrant-dev-setup/dex/web/robots.txt ]; then
  exit 0
fi

# create directory structure
mkdir -p kuadrant-dev-setup/dex/web/templates

DEX_IMAGE="${DEX_IMAGE:-ghcr.io/dexidp/dex:v2.45.1}"
if ! docker image inspect "${DEX_IMAGE}" >/dev/null 2>&1; then
  echo "==> pulling ${DEX_IMAGE} (first start)..."
  docker pull "${DEX_IMAGE}"
fi

# extract dex web files from container image
docker run --rm --user "$(id -u):$(id -g)" --pull=never \
  -v "$(pwd)/kuadrant-dev-setup/dex:/tmp/out" \
  "${DEX_IMAGE}" \
  sh -c '
    cp -r /srv/dex/web/static /srv/dex/web/themes /srv/dex/web/robots.txt /tmp/out/web/
    for f in /srv/dex/web/templates/*.html; do
      if [ "$(basename $f)" != "password.html" ]; then
        cp $f /tmp/out/web/templates/
      fi
    done
  '
