# Kuadrant Backstage Plugin

Backstage plugin for managing Kuadrant API access - enables self-service API key provisioning with plan-based rate limiting.

## Features

- **API Product Management** - Browse published APIs with plan tiers and rate limits
- **API Access Requests** - Self-service API key request and approval workflow
- **Plan-Based Rate Limiting** - Gold/Silver/Bronze tier support via Kuadrant PlanPolicy
- **API Key Management** - View, manage, and delete API keys with show/hide functionality
- **Admin Approval Queue** - Platform admins can review and approve access requests
- **Kubernetes Integration** - Automatic cluster access via service account or local kubeconfig

## Quick Start

```bash
# create kind cluster with kuadrant
make kind-create

# start rhdh with plugins
make dev
```

Access RHDH at http://localhost:7008

- Kuadrant plugin: http://localhost:7008/kuadrant
- Toystore API demo: http://localhost:7008/catalog/default/api/toystore-api

### First-Time Setup

For new users:

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd kuadrant-backstage-plugin
   ```

2. **(Optional) Configure GitHub auth**:
   - Edit `rhdh-config-overlay/.env` with GitHub OAuth credentials
   - See [Authentication](#authentication) section for details

3. **Create cluster and start RHDH**:
   ```bash
   make kind-create
   make dev
   ```

   Note: On first run, `make dev` automatically:
   - Initialises the rhdh-local git submodule
   - Applies configuration customisations
   - Installs all dependencies
   - Builds the plugins

   This may take a few minutes.

## What Gets Installed

- Kubernetes cluster (kind)
- Gateway API v1.2.0
- Istio (gateway implementation)
- Kuadrant Operator v1.3.0-rc2 (with extensions enabled)
- Demo resources: Toystore API with APIProduct, AuthPolicy, and PlanPolicy

## Architecture

```
kuadrant-backstage-plugin/
├── kuadrant-backstage/
│   └── plugins/
│       ├── kuadrant/              # frontend plugin (react)
│       └── kuadrant-backend/      # backend plugin (express api)
├── rhdh-local/                    # rhdh runtime (git submodule)
├── rhdh-config-overlay/           # rhdh configuration
├── toystore-demo.yaml             # demo resources
└── Makefile                       # automation
```

## Development Workflow

1. **Make changes** to plugin code in `kuadrant-backstage/plugins/`
2. **Rebuild and deploy**: `make deploy`
3. **View changes** at http://localhost:7008

Plugins support hot reload during development with `yarn start` in the plugin directories.

## Makefile Targets

### Cluster Management
- `make kind-create` - create cluster + install kuadrant + deploy demo
- `make kind-delete` - delete cluster
- `make clean` - stop rhdh + delete cluster

### RHDH Development
- `make dev` - start rhdh with plugins (full dev environment)
- `make deploy` - rebuild plugins + restart rhdh
- `make build` - build plugins only
- `make export` - export plugins as dynamic plugins

### Kuadrant Management
- `make kuadrant-install` - install kuadrant on existing cluster
- `make kuadrant-uninstall` - uninstall kuadrant
- `make demo-install` - install toystore demo resources
- `make demo-uninstall` - uninstall demo resources

### Testing
- `make gateway-forward` - Port-forward to gateway for API testing

## Testing API Access

```bash
# start port-forward
make gateway-forward

# test with alice's gold tier key (100 requests/day)
curl -H 'Host: api.toystore.com' \
     -H 'Authorization: APIKEY secret-alice-key' \
     http://localhost:8080/

# test with bob's silver tier key (50 requests/day)
curl -H 'Host: api.toystore.com' \
     -H 'Authorization: APIKEY secret-bob-key' \
     http://localhost:8080/
```

## Plugin Capabilities

### API Products Page (Kuadrant)
- Browse published APIProduct resources
- View API products with plan information
- Admin approval queue for pending access requests
- Role-based access (platform engineers only)

### API Access Card (on API entity pages)
- View API product details and available plan tiers
- See rate limits per tier (Gold/Silver/Bronze)
- Link to API Keys tab for request management
- Read-only summary of API access options

### API Key Management Tab (on API entity pages)
- Request API key with plan selection and use case
- View user's pending, approved, and rejected requests
- Show/hide API key values securely
- Delete API keys
- Displays plan tier, creation date, and request status

### Admin Approval Queue (platform engineers)
- Review pending API key requests
- Approve or reject with comments
- View request details (user, API, plan, use case)
- Automatically creates secrets on approval

## Configuration

### RHDH Setup
Configuration managed via `rhdh-config-overlay/`:
- `app-config.local.yaml` - RHDH app config overrides
- `.env` - Environment variables (kubeconfig path, GitHub credentials)
- `kubeconfig.yaml` - Auto-generated Kubernetes credentials
- `toystore.yaml` - Catalog entities

### Authentication

By default, RHDH uses **guest authentication** for easy local development. To enable GitHub authentication with org/team ingestion for RBAC:

#### 1. Create GitHub OAuth App

Visit https://github.com/settings/developers and create a new OAuth app:
- **Application name**: `RHDH Local Dev` (or your choice)
- **Homepage URL**: `http://localhost:7008`
- **Callback URL**: `http://localhost:7008/api/auth/github/handler/frame`

Save the **Client ID** and generate a **Client Secret**.

#### 2. Create GitHub Personal Access Token

Visit https://github.com/settings/tokens and create a new token with scopes:
- `read:org` - Read org and team membership
- `read:user` - Read user profile data
- `user:email` - Read user email addresses

#### 3. Configure Environment Variables

Edit `rhdh-config-overlay/.env`:

```bash
# github oauth (optional - for github auth provider)
AUTH_GITHUB_CLIENT_ID=your_client_id_here
AUTH_GITHUB_CLIENT_SECRET=your_client_secret_here

# github integration (optional - for catalog ingestion and rbac)
GITHUB_TOKEN=ghp_your_token_here

# github organisation ingestion (optional)
GITHUB_ORG_URL=https://github.com/your-org-name
```

**Note**: The `.env` file is gitignored. Use `.env.example` as a template.

#### 4. Enable GitHub Auth in Config

The GitHub auth configuration is already present in `rhdh-config-overlay/app-config.local.yaml`. When you fill in the `.env` file and run `make dev`, GitHub authentication will be automatically enabled.

The setup includes:
- **GitHub OAuth** - Sign in with GitHub
- **GitHub Org Provider** - Imports users and teams from your org
- **RBAC** - Admin permissions configured via `permission.rbac.admin.users`

#### 5. Deploy with GitHub Auth

```bash
# after configuring .env
make dev
```

The `.env` file will be automatically copied to `rhdh-local/` during startup. RHDH will:
- Enable GitHub sign-in alongside guest auth
- Import users and teams from your GitHub org every 60 minutes
- Grant admin permissions to configured users

#### Switching Between Guest and GitHub Auth

**Guest auth (default)**:
- Leave `.env` GitHub credentials empty
- Quick setup for testing
- No user/team management

**GitHub auth (production-like)**:
- Fill in `.env` with GitHub credentials
- Real user identities
- Team-based RBAC
- Org membership sync

#### Customising Admin Users

To grant admin permissions to specific users, edit `rhdh-config-overlay/app-config.local.yaml`:

```yaml
permission:
  enabled: true
  rbac:
    admin:
      users:
        - name: user:default/your-github-username
      superUsers:
        - name: user:default/your-github-username
```

Replace `your-github-username` with the GitHub username(s) you want to grant admin access.

### Kubernetes Access
- **Local dev**: Uses kubeconfig in `configs/extra-files/.kube/config`
- **OpenShift**: Uses in-cluster service account automatically
- **RBAC**: Requires read/write on Kuadrant CRDs and Secrets

## Prerequisites

- Node.js 20 or 22 (not 24 - isolated-vm build issues)
- Yarn
- Docker/OrbStack
- kubectl

## Known Limitations

- **Node 24**: Not supported due to isolated-vm compatibility
- **PlanPolicy Status**: Controller creates RateLimitPolicy but may show enforcement errors until all operators are ready

## RBAC and Permissions

The plugin uses Backstage's permission framework with role-based access control.

### User Roles

**Platform Engineer (admin)**
- Approve/reject API key requests
- View and manage all API keys across all namespaces
- Access to API products page with admin approval queue
- Full visibility of all pending requests

**App Developer**
- View API products
- Request API keys for own use
- View and manage only own API keys
- Access to API products page (view only)

**API Consumer**
- Request API keys for APIs
- View and manage only own API keys
- Limited catalog access

### Groups and Permissions

**Groups** (defined in `rhdh-config-overlay/toystore.yaml`):
- `platform-engineers` - Admin group
- `app-developers` - Developer group
- `api-consumers` - Consumer group

**Permissions** (defined in backend):
- `kuadrant.apiproduct.read` - View API products
- `kuadrant.request.create` - Create API key requests
- `kuadrant.request.read.own` - Read own requests
- `kuadrant.request.read.all` - Read all requests (admin)
- `kuadrant.request.approve` - Approve API key requests (admin)
- `kuadrant.request.reject` - Reject API key requests (admin)
- `kuadrant.apikey.read.own` - Read own API keys
- `kuadrant.apikey.read.all` - Read all API keys (admin)
- `kuadrant.apikey.delete.own` - Delete own API keys
- `kuadrant.apikey.delete.all` - Delete any API key (admin)

**RBAC Policy** (`rhdh-config-overlay/rbac-policy.csv`):
- Maps roles to permissions using Casbin policy format
- Assigns users to roles via group membership

### Testing with Different Users

Switch between test users to verify RBAC behaviour:

```bash
# makefile targets
make rhdh-user-admin      # platform engineer (can approve requests)
make rhdh-user-developer  # app developer (cannot approve)
make rhdh-user-consumer   # api consumer (limited access)

# or use script directly
./switch-user.sh admin
```

**Test users** (defined in `rhdh-config-overlay/users.yaml`):
- `admin` - member of platform-engineers group
- `developer` - member of app-developers group
- `consumer` - member of api-consumers group

After switching:
1. Wait ~10 seconds for RHDH to restart
2. Hard refresh browser (cmd+shift+r)
3. You're now authenticated as the selected user

This uses guest authentication with environment-based user switching for local testing.

### Kubernetes RBAC

The `config/rbac/` directory contains Kubernetes RBAC manifests for production deployments:

- `api-key-requester-role.yaml` - Namespace-scoped role for users who can request API keys
- `api-key-approver-clusterrole.yaml` - Cluster-scoped role for admins who can approve requests

When deploying Backstage to Kubernetes/OpenShift, bind these roles to the Backstage service account. See `config/rbac/README.md` for detailed documentation.

## Troubleshooting

Common issues:

### First-Time Setup
- **"node_modules state file" error**: Dependencies not installed. Run `make install` or just run `make dev` which will install them automatically
- **TypeScript compilation errors**: Run `cd kuadrant-backstage && yarn tsc` to check for errors, or let `make build` handle it automatically
- **Plugins not building**: Make sure you're using Node 20 or 22 (not 24), check with `node --version`

### Kubernetes Access
- **401 errors**: Check kubeconfig path in RHDH logs
- **Stale token**: Regenerate with `make rhdh-kubeconfig`
- **Plugins not loading**: Check `docker logs rhdh`

### GitHub Authentication
- **GitHub auth not working**: Check `.env` file was copied to `rhdh-local/`:
  ```bash
  cat rhdh-local/.env | grep GITHUB
  ```
- **Container crashes with "Missing required config"**: GitHub auth is enabled in `app-config.local.yaml` but `.env` credentials are empty - either fill in credentials or comment out GitHub config
- **Org ingestion fails**: Check GitHub token has `read:org` scope and GITHUB_ORG_URL format is correct (e.g., `https://github.com/kuadrant`)
- **Users not showing up**: Wait up to 60 minutes for initial org sync, or check logs:
  ```bash
  docker logs rhdh 2>&1 | grep -i "github.*users"
  ```

## References

- [Kuadrant Documentation](https://docs.kuadrant.io)
- [RHDH-Local](https://github.com/redhat-developer/rhdh-local)
- [Backstage Documentation](https://backstage.io/docs)
- [Gateway API](https://gateway-api.sigs.k8s.io/)
