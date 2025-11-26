#!/bin/bash

# Script to gather required config to setup kubernetes integration with backstage
# Requires kube session active
# Specifically:
#   * sets cluster URL in K8S_URL (.env)
#   * sets rhdh service account token in K8S_CLUSTER_TOKEN (.env)
# Usage: ./scripts/kube-env-setup.sh

set -e

SERVICE_ACCOUNT="rhdh"
NAMESPACE="default"
ENV_FILE="$(cd "$(dirname "$0")/../.." && pwd)/.env"
TOKEN_DURATION="525600m"  # 1 year (365 days * 24 hours * 60 minutes)

echo "Gathering Kubernetes configuration..."

# Get current context
CURRENT_CONTEXT=$(kubectl config current-context)
if [ -z "$CURRENT_CONTEXT" ]; then
    echo "Error: No current kubeconfig context found"
    echo "Please ensure you have an active kubernetes session"
    exit 1
fi

echo "Current context: $CURRENT_CONTEXT"

# Get cluster URL from current context
CLUSTER_URL=$(kubectl config view -o jsonpath="{.clusters[?(@.name==\"$(kubectl config view -o jsonpath="{.contexts[?(@.name==\"$CURRENT_CONTEXT\")].context.cluster}")\")].cluster.server}")
if [ -z "$CLUSTER_URL" ]; then
    echo "Error: Could not determine cluster URL from current context"
    exit 1
fi

echo "Cluster URL: $CLUSTER_URL"

# Generate service account token
echo "Generating token for service account $SERVICE_ACCOUNT in namespace $NAMESPACE..."
TOKEN=$(kubectl create token "$SERVICE_ACCOUNT" -n "$NAMESPACE" --duration="$TOKEN_DURATION" 2>&1)
if [ $? -ne 0 ]; then
    echo "Error: Failed to generate token"
    echo "$TOKEN"
    exit 1
fi

if [ -z "$TOKEN" ]; then
    echo "Error: Generated token is empty"
    exit 1
fi

echo "Token generated successfully"

# Update .env file
echo "Updating $ENV_FILE..."

# Create temporary file
TEMP_FILE=$(mktemp)

# If .env exists, read it and update/add values
if [ -f "$ENV_FILE" ]; then
    # Remove existing K8S_URL and K8S_CLUSTER_TOKEN lines
    grep -v "^K8S_URL=" "$ENV_FILE" | grep -v "^K8S_CLUSTER_TOKEN=" > "$TEMP_FILE" || true
else
    touch "$TEMP_FILE"
fi

# Append new values
echo "K8S_URL=$CLUSTER_URL" >> "$TEMP_FILE"
echo "K8S_CLUSTER_TOKEN=$TOKEN" >> "$TEMP_FILE"

# Move temp file to .env
mv "$TEMP_FILE" "$ENV_FILE"

echo ""
echo "Configuration updated successfully!"
echo ""
echo "Environment variables written to $ENV_FILE:"
echo "  K8S_URL=$CLUSTER_URL"
echo "  K8S_CLUSTER_TOKEN=<token-hidden>"
echo ""
echo "These variables will be automatically loaded when you run 'yarn dev' or 'yarn start'."
echo ""
