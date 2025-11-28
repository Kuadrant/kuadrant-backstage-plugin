# kuadrant development setup

development environment for kuadrant plugins in rhdh.

## quick start

```bash
# create kind cluster with kuadrant
make kind-create

# start rhdh with hot reload
cd ..
yarn dev
```

visit http://localhost:3000/kuadrant

## what gets installed

**kubernetes cluster (kind):**
- kind cluster named `local-cluster`
- kuadrant operator v1.3.0
- gateway api crds v1.2.0
- istio service mesh (base + istiod)

**kuadrant components:**
- custom crds: APIProduct, APIKeyRequest
- kuadrant instance in `kuadrant-system` namespace

**demo resources (toystore):**
- toystore namespace
- gateway with httproute
- authpolicy for api key authentication
- planpolicy for rate limiting
- sample api products
- example secrets

**rbac:**
- rhdh service account with cluster access
- permissions for kuadrant crds and secrets

## directory structure

```
kuadrant-dev-setup/
├── Makefile                  # cluster and kuadrant setup
├── README.md                 # this file
├── crds/                     # custom resource definitions
│   ├── devportal.kuadrant.io_apiproduct.yaml
│   └── devportal.kuadrant.io_apikeyrequest.yaml
├── demo/                     # demo resources
│   └── toystore-demo.yaml    # toystore api with policies
├── rbac/                     # rbac configs
│   └── rhdh-rbac.yaml        # rhdh service account permissions
└── scripts/                  # helper scripts
    └── kind-cluster.yaml     # kind cluster configuration
```

## commands

### cluster management
```bash
make kind-create    # create cluster + install kuadrant + demo
make kind-delete    # delete cluster
make clean          # delete cluster + cleanup bin/
```

### kuadrant
```bash
make kuadrant-install   # install kuadrant v1.3.0
make demo-install       # install toystore demo
make demo-uninstall     # remove toystore demo
```

### verify installation
```bash
# check kuadrant pods
kubectl get pods -n kuadrant-system

# check demo resources
kubectl get pods -n toystore
kubectl get apiproducts -n toystore
kubectl get gateway -n toystore
kubectl get httproute -n toystore
kubectl get authpolicies -n toystore
kubectl get planpolicies -n toystore

# check api keys
kubectl get secrets -n toystore
```

## development workflow

1. **create cluster** (once):
   ```bash
   make kind-create
   ```

2. **develop plugins** (with hot reload):
   ```bash
   cd ..
   yarn dev
   ```
   changes to plugin code automatically rebuild

3. **test in browser**:
   - main page: http://localhost:3000/kuadrant
   - catalog: http://localhost:3000/catalog
   - api entity: http://localhost:3000/catalog/default/api/toystore-api

4. **cleanup** (when done):
   ```bash
   make kind-delete
   ```

## troubleshooting

### cluster won't start
```bash
# delete and recreate
make kind-delete
make kind-create
```

### kuadrant not installing
```bash
# check helm repos
./bin/helm-v3.13.0 repo list

# reinstall
make kuadrant-install
```

### demo resources missing
```bash
# reinstall demo
make demo-uninstall
make demo-install
```

### rhdh can't connect to cluster
```bash
# verify service account
kubectl get sa rhdh-service-account -n rhdh

# check rbac
kubectl get clusterrole rhdh-kuadrant
kubectl get clusterrolebinding rhdh-kuadrant

# check kubeconfig (rhdh uses local ~/.kube/config in dev mode)
kubectl config current-context
```

## dependencies

the makefile automatically downloads:
- kind v0.20.0 (to `bin/kind-v0.20.0`)
- helm v3.13.0 (to `bin/helm-v3.13.0`)

no manual installation needed.

## differences from kuadrant-backstage-plugin repo

this setup is simplified for rhdh development:

**what we kept:**
- kind cluster creation
- kuadrant v1.3.0 installation
- toystore demo resources
- custom crds

**what we simplified:**
- single makefile (no complex includes)
- no rhdh-local submodule (uses rhdh's yarn dev)
- no dynamic plugin export (direct imports)
- no rbac user switching (uses guest auth)
- no separate backstage mode (only hot reload mode)

**result:**
cleaner development experience with hot reload and full catalog integration.
