#!/usr/bin/env bash
set -euo pipefail

# installs metallb and configures it for the kind container network
# works with both docker and podman

METALLB_VERSION="${METALLB_VERSION:-v0.13.7}"

# detect container runtime (docker or podman)
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  CONTAINER_ENGINE="docker"
elif command -v podman &>/dev/null; then
  CONTAINER_ENGINE="podman"
else
  echo "error: neither docker nor podman found"
  exit 1
fi

echo "installing metallb ${METALLB_VERSION} (container engine: ${CONTAINER_ENGINE})..."
kubectl apply -f "https://raw.githubusercontent.com/metallb/metallb/${METALLB_VERSION}/config/manifests/metallb-native.yaml"

echo "waiting for metallb controller..."
kubectl rollout status -n metallb-system deployment/controller --timeout=120s
echo "waiting for metallb speaker..."
kubectl rollout status -n metallb-system daemonset/speaker --timeout=120s

# derive the IPv4 subnet from the kind container network
# networks may have both IPv4 and IPv6 entries, so we list all and pick IPv4
if [ "${CONTAINER_ENGINE}" = "docker" ]; then
  ALL_SUBNETS=$("${CONTAINER_ENGINE}" network inspect kind -f '{{range .IPAM.Config}}{{.Subnet}}{{"\n"}}{{end}}')
else
  ALL_SUBNETS=$("${CONTAINER_ENGINE}" network inspect kind -f '{{range .Subnets}}{{.Subnet}}{{"\n"}}{{end}}')
fi
# pick the first IPv4 CIDR (matches N.N.N.N/N pattern)
KIND_NET_CIDR=$(echo "${ALL_SUBNETS}" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/' | head -1)

if [ -z "${KIND_NET_CIDR}" ]; then
  echo "error: could not determine kind network subnet"
  exit 1
fi

# use .200-.250 within the subnet (avoids low IPs used by kind nodes)
METALLB_IP_START=$(echo "${KIND_NET_CIDR}" | sed 's|\([0-9]*\.[0-9]*\.[0-9]*\)\..*|\1.200|')
METALLB_IP_END=$(echo "${KIND_NET_CIDR}" | sed 's|\([0-9]*\.[0-9]*\.[0-9]*\)\..*|\1.250|')

echo "configuring metallb with range: ${METALLB_IP_START}-${METALLB_IP_END}"

kubectl apply -f - <<EOF
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: kind-pool
  namespace: metallb-system
spec:
  addresses:
  - ${METALLB_IP_START}-${METALLB_IP_END}
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: l2advert
  namespace: metallb-system
EOF

echo "metallb configured"
