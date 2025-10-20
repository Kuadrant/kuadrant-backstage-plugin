#!/bin/bash

# script to switch between users for testing

USER=$1

if [ -z "$USER" ]; then
  echo "usage: ./switch-user.sh [admin|developer|consumer]"
  echo ""
  echo "users:"
  echo "  admin     - platform engineer (can approve requests, view plan policies, see kuadrant page)"
  echo "  developer - app developer (can view api products, see kuadrant page, manage own keys)"
  echo "  consumer  - api consumer (can only request and manage own api keys)"
  echo ""
  echo "current user:"
  grep "AUTH_GUEST_USER" rhdh-local/.env 2>/dev/null || echo "  not configured"
  exit 1
fi

if [ "$USER" != "admin" ] && [ "$USER" != "developer" ] && [ "$USER" != "consumer" ]; then
  echo "error: user must be admin, developer, or consumer"
  exit 1
fi

echo "switching to user: $USER"

# update .env file
if grep -q "AUTH_GUEST_USER" rhdh-local/.env 2>/dev/null; then
  sed -i '' "s/AUTH_GUEST_USER=.*/AUTH_GUEST_USER=$USER/" rhdh-local/.env
else
  echo "AUTH_GUEST_USER=$USER" >> rhdh-local/.env
fi

# update app-config to use the env var
cat > /tmp/guest-config.yaml <<EOF
auth:
  environment: development
  providers:
    guest:
      userEntityRef: user:default/\${AUTH_GUEST_USER}
EOF

# restart rhdh (recreate container to reload .env file)
echo "restarting rhdh..."
cd rhdh-local
docker compose up -d --force-recreate rhdh >/dev/null 2>&1

echo ""
echo "✓ switched to user: $USER"
echo "✓ rhdh restarting at http://localhost:7008"
echo ""
echo "refresh your browser in 10 seconds"
