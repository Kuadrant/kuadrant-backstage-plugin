# oinc Development Environment Scripts

Scripts for setting up and testing Kuadrant plugins with RHDH on an oinc cluster.

## Quick Start

```bash
# 1. Set up Red Hat registry credentials
cd oinc
cp .env.example .env
# Edit .env with your credentials from https://access.redhat.com/terms-based-registry/

# 2. Build plugins
cd ..
yarn build
cd plugins/kuadrant && yarn export-dynamic
cd ../kuadrant-backend && yarn export-dynamic
cd ../..

# 3. Create cluster and install RHDH
yarn oinc
```

## Prerequisites

- [oinc](https://github.com/jasonmadigan/oinc) installed
- kubectl
- Docker or Podman
- Red Hat registry credentials (free, get from <https://access.redhat.com/terms-based-registry/>)

## Scripts

- `setup.sh` - Main entry point (runs cluster + RHDH setup)
- `setup-cluster.sh` - Creates oinc cluster with Kuadrant stack
- `setup-rhdh.sh` - Installs RHDH operator v1.8 with local plugins
- `update-local-plugins.sh` - Updates plugins in PVC after code changes
- `teardown.sh` - Deletes the cluster

## Configuration Files

- `.env.example` - Template for registry credentials
- `.env` - Your credentials (gitignored, you must create this)
- `manifests/rhdh-sa.yaml` - RHDH service account and RBAC
- `manifests/app-config-rhdh.yaml` - RHDH configuration

## After Setup

Access RHDH:

```bash
kubectl port-forward svc/backstage-rhdh 7007:7007 -n rhdh
# http://localhost:7007/kuadrant
```

OpenShift Console:

```
http://localhost:9000
```

## Updating Plugins

After code changes:

```bash
# 1. Rebuild
yarn build
cd plugins/kuadrant && yarn export-dynamic  # creates dist-scalprum
cd ../kuadrant-backend && yarn export-dynamic  # creates dist-dynamic
cd ../..

# 2. Update PVC
./oinc/update-local-plugins.sh

# 3. Restart RHDH
kubectl rollout restart deployment/backstage-rhdh -n rhdh
```

See [docs/oinc.md](../docs/oinc.md) for full documentation.
