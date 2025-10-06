# Kuadrant Backstage Plugin - Development Guide

## Overview

This project provides Backstage/RHDH plugins for managing Kuadrant resources. The development environment uses Red Hat Developer Hub (RHDH) running in Docker Compose with dynamic plugins.

## RHDH-Local Submodule Approach

This project uses `rhdh-local` as a Git submodule to provide the RHDH development environment. Our customisations are kept separate in `rhdh-config-overlay/` to maintain clean separation between upstream rhdh-local and our project-specific changes.

**Benefits:**
- RHDH-local can be updated independently
- Easy upstream updates: `git submodule update --remote`
- Customisations tracked in overlay files
- Clean git diffs (RHDH-local changes don't pollute main repo)

**First Time Setup:**
```bash
# Initialise rhdh-local submodule
make rhdh-submodule-init

# Apply customisations
make rhdh-setup
```

**RHDH-Config-Overlay Contents:**
- `app-config.local.yaml` - RHDH app config overrides
- `.env` - Environment variables (kubeconfig path)
- `kubeconfig.yaml` - Auto-generated Kubernetes credentials
- `toystore.yaml` - Catalog entities

**Updating RHDH-Local Upstream:**
```bash
cd rhdh-local
git pull origin main
cd ..
make rhdh-setup  # Re-apply customisations
```

## Repository Structure

```
.
├── kuadrant-backstage/          # Backstage workspace (source code)
│   ├── plugins/
│   │   ├── kuadrant/            # Frontend plugin
│   │   └── kuadrant-backend/    # Backend plugin
│   └── packages/backend/        # (Legacy, no longer used)
├── rhdh-local/                  # RHDH submodule (Git submodule)
│   ├── configs/                 # RHDH configuration
│   │   ├── app-config/
│   │   └── dynamic-plugins/
│   └── local-plugins/           # Exported dynamic plugins (generated)
├── rhdh-config-overlay/         # Our RHDH customisations
│   ├── app-config.local.yaml
│   ├── .env
│   └── toystore.yaml
├── rhdh-rbac.yaml               # Kubernetes RBAC for RHDH
└── Makefile                     # Development commands
```

## Prerequisites

- Node.js 18+ and Yarn
- Docker and Docker Compose
- kind (for local Kubernetes cluster)
- kubectl
- Helm

## Quick Start

```bash
# Create kind cluster with Kuadrant installed
make kind-create

# Start RHDH with plugins (builds and exports automatically)
make dev
```

Visit http://localhost:7008/kuadrant

## Development Workflow

### 1. First Time Setup

```bash
# Install plugin dependencies
make install

# Create Kubernetes cluster with Kuadrant
make kind-create
```

### 2. Start Development Environment

```bash
# Start RHDH (automatically builds/exports if needed)
make dev
```

This will:
- Check if plugins are built (builds if needed)
- Check if plugins are exported (exports if needed)
- Start RHDH in Docker Compose
- Show you where to access the UI

### 3. Make Changes to Plugins

Edit files in:
- `kuadrant-backstage/plugins/kuadrant/src/` (frontend)
- `kuadrant-backstage/plugins/kuadrant-backend/src/` (backend)

### 4. Rebuild and Redeploy

```bash
# Rebuild, export, and restart RHDH
make deploy
```

This is your main dev loop command. It will:
- Build both plugins
- Export them as dynamic plugins
- Copy to rhdh-local/local-plugins/
- Restart RHDH with the new versions

### 5. Test Your Changes

Visit http://localhost:7008/kuadrant and verify your changes work.

## Available Commands

### Development
- `make dev` - Start RHDH development environment
- `make deploy` - Rebuild plugins and restart RHDH (main dev loop)
- `make install` - Install plugin dependencies
- `make build` - Build both plugins
- `make export` - Export plugins as dynamic plugins

### Kubernetes Cluster
- `make kind-create` - Create kind cluster with Kuadrant
- `make kind-delete` - Delete kind cluster
- `make kuadrant-install` - Install Kuadrant on existing cluster
- `make kuadrant-uninstall` - Uninstall Kuadrant

### Cleanup
- `make clean` - Stop RHDH and delete kind cluster

## Architecture Notes

### Why RHDH Instead of Vanilla Backstage?

Red Hat Developer Hub (RHDH) is the target deployment environment for these plugins. By developing against RHDH locally, we ensure compatibility with the production environment.

### Dynamic Plugins

RHDH uses dynamic plugins - plugins that can be loaded at runtime without rebuilding the entire application. Our development workflow:

1. **Source Code** - Plugins in `kuadrant-backstage/plugins/`
2. **Build** - Compile TypeScript, generate bundles
3. **Export** - Use `@red-hat-developer-hub/cli` to create dynamic plugin format
4. **Deploy** - Copy to `rhdh-local/local-plugins/` and restart RHDH

### Plugin Loading

RHDH loads dynamic plugins via configuration in:
- `rhdh-local/configs/dynamic-plugins/dynamic-plugins.override.yaml`

This file defines:
- Which plugins to load
- Where to find them (filesystem path)
- How to mount them (routes, tabs, etc.)

### Kubernetes Access

Both the Backstage Kubernetes plugin and our custom Kuadrant backend plugin need access to the Kubernetes API. They use:
- In-cluster service account (when running in Kubernetes)
- Local kubeconfig (when running locally)

The `@kubernetes/client-node` library's `loadFromDefault()` handles both cases automatically.

### Port 7007 vs 7008

The kind cluster exposes a service on port 7007 (mapping to container port 30007). RHDH runs on port 7008 to avoid conflicts:
- RHDH container internally listens on 7007
- Docker maps `7008:7007` (host:container)
- `BASE_URL` environment variable tells RHDH to use localhost:7008 for frontend URLs

## Plugin Structure

### Frontend Plugin (`kuadrant`)

**Location**: `kuadrant-backstage/plugins/kuadrant/`

**Key Files**:
- `src/plugin.ts` - Plugin definition and routable extensions
- `src/components/ExampleComponent/` - Main Kuadrant resources page
- `src/components/ApiAccessCard/` - Card component for showing plans
- `src/components/ApiKeyManagementTab/` - Tab component for managing API keys

**Scalprum Config** (`package.json`):
```json
{
  "scalprum": {
    "name": "internal.plugin-kuadrant",
    "exposedModules": {
      "PluginRoot": "./src/plugin.ts",
      "KuadrantPage": "./src/plugin.ts",
      "ApiAccessCard": "./src/components/ApiAccessCard/index.ts",
      "ApiKeyManagementTab": "./src/components/ApiKeyManagementTab/index.ts"
    }
  }
}
```

### Backend Plugin (`kuadrant-backend`)

**Location**: `kuadrant-backstage/plugins/kuadrant-backend/`

**Key Files**:
- `src/plugin.ts` - Plugin definition with dependencies
- `src/service/router.ts` - Express router with API endpoints
- `src/lib/k8s-client.ts` - Kubernetes client wrapper

**API Endpoints**:
- `GET /authpolicies` - List AuthPolicy resources
- `GET /ratelimitpolicies` - List RateLimitPolicy resources
- `GET /planpolicies` - List PlanPolicy resources
- `GET /planpolicies/:namespace/:name` - Get specific PlanPolicy
- `GET /apikeys` - List API key secrets (filtered by namespace/user)
- `POST /apikeys` - Create new API key secret
- `DELETE /apikeys/:namespace/:name` - Delete API key secret

## Troubleshooting

### RHDH Won't Start

Check if port 7008 is already in use:
```bash
lsof -i :7008
```

### Plugins Not Loading

Check RHDH logs:
```bash
docker logs rhdh 2>&1 | grep -i kuadrant
```

### Kubernetes Connection Errors

Verify your kind cluster is running:
```bash
kubectl cluster-info --context kind-local-cluster
kubectl get pods -n kuadrant-system
```

### Plugin Changes Not Appearing

Make sure you ran `make deploy` to rebuild and restart RHDH.

### 404 Errors in Browser

Hard refresh the browser (Cmd+Shift+R) to clear cached JavaScript.

### Want to See More Logs

Tail RHDH logs:
```bash
docker logs -f rhdh
```

## Next Steps

- Explore the Kuadrant plugin UI at http://localhost:7008/kuadrant
- View API keys at http://localhost:7008/kuadrant (API keys section)
- Check entity pages for APIs with Kuadrant annotations
- Read the main README.md for more architectural details
