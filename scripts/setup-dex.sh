#!/bin/bash
set -e

# check if dex web files already exist
if [ -f kuadrant-dev-setup/dex/web/robots.txt ]; then
  exit 0
fi

# create directory structure
mkdir -p kuadrant-dev-setup/dex/web/templates

# extract dex web files from container image
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$(pwd)/kuadrant-dev-setup/dex:/tmp/out" \
  ghcr.io/dexidp/dex:latest \
  sh -c '
    cp -r /srv/dex/web/static /srv/dex/web/themes /srv/dex/web/robots.txt /tmp/out/web/
    for f in /srv/dex/web/templates/*.html; do
      if [ "$(basename $f)" != "password.html" ]; then
        cp $f /tmp/out/web/templates/
      fi
    done
  '
