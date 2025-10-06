#!/bin/bash
# patch compose.yaml for kuadrant development

set -e

COMPOSE_FILE="$1"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "error: $COMPOSE_FILE not found"
    exit 1
fi

# backup original
cp "$COMPOSE_FILE" "$COMPOSE_FILE.bak"

# use perl for reliable in-place editing on macOS
perl -i -pe 's/"7007:7007"/"7008:7007"/' "$COMPOSE_FILE"

# add BASE_URL after NODE_OPTIONS if not present
if ! grep -q "BASE_URL" "$COMPOSE_FILE"; then
    perl -i -pe 's/(NODE_OPTIONS:.*\n)/$1      BASE_URL: "http:\/\/localhost:7008"\n/' "$COMPOSE_FILE"
fi

# add extra_hosts after environment if not present
if ! grep -q "extra_hosts:" "$COMPOSE_FILE"; then
    perl -i -0777 -pe 's/(environment:\n.*?NODE_OPTIONS:[^\n]*\n(?:.*?BASE_URL:[^\n]*\n)?)/$1    extra_hosts:\n      - "host.docker.internal:host-gateway"\n/' "$COMPOSE_FILE"
fi

# add local-plugins volume to rhdh service if not present
if ! grep -A 30 "container_name: rhdh" "$COMPOSE_FILE" | grep -B 5 "depends_on:" | grep -q "./local-plugins:/opt/app-root/src/local-plugins"; then
    perl -i -0777 -pe 's/(container_name: rhdh.*?volumes:.*?)(- \.\/configs:\/opt\/app-root\/src\/configs:Z\n)/$1$2      - .\/local-plugins:\/opt\/app-root\/src\/local-plugins:Z\n/s' "$COMPOSE_FILE"
fi

# add networks section at end if not present
if ! grep -q "^networks:" "$COMPOSE_FILE"; then
    cat >> "$COMPOSE_FILE" << 'EOF'

networks:
  kind:
    external: true
EOF
fi

# add networks to rhdh service if not present
if ! grep -A 20 "container_name: rhdh" "$COMPOSE_FILE" | grep -B 1 "depends_on:" | grep -q "networks:"; then
    perl -i -0777 -pe 's/(extra_hosts:\n\s+- "host\.docker\.internal:host-gateway"\n)(\s+volumes:)/$1    networks:\n      - default\n      - kind\n$2/' "$COMPOSE_FILE"
fi

rm -f "$COMPOSE_FILE.bak"
echo "compose.yaml patched successfully"
