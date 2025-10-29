#!/bin/bash

# script to switch between users for testing rbac

USER=$1

if [ -z "$USER" ]; then
  echo "usage: ./switch-user.sh [platform-engineer|api-owner|api-consumer]"
  echo ""
  echo "users:"
  echo "  platform-engineer - manages infrastructure (planpolicy, gateways, httproutes)"
  echo "  api-owner         - publishes apis, approves api key requests"
  echo "  api-consumer      - browses apis, requests access to apis"
  echo ""
  echo "current user:"
  grep "BACKSTAGE_GUEST_USER" app-config.local.yaml 2>/dev/null | sed 's/.*: /  /' || echo "  not configured"
  exit 1
fi

if [ "$USER" != "platform-engineer" ] && [ "$USER" != "api-owner" ] && [ "$USER" != "api-consumer" ]; then
  echo "error: user must be platform-engineer, api-owner, or api-consumer"
  exit 1
fi

echo "switching to user: $USER"

# update app-config.local.yaml
if grep -q "userEntityRef:" app-config.local.yaml 2>/dev/null; then
  sed -i '' "s|userEntityRef:.*|userEntityRef: user:default/$USER|" app-config.local.yaml
else
  echo "error: could not find userEntityRef in app-config.local.yaml"
  exit 1
fi

echo ""
echo "✓ switched to user: $USER (backstage entity: user:default/$USER)"
echo "✓ restart rhdh with: yarn dev"
echo ""
echo "the backend will automatically reload and use the new user"
