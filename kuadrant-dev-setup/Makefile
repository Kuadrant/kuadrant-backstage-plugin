.PHONY: help kind-create kind-delete kuadrant-install metallb-install demo-install demo-uninstall clean

CLUSTER_NAME ?= local-cluster
LOCALBIN ?= $(shell pwd)/bin
KUADRANT_VERSION ?= main

help:
	@echo "kuadrant development setup for rhdh"
	@echo ""
	@echo "quick start:"
	@echo "  make kind-create    - create kind cluster with kuadrant"
	@echo "  cd .. && yarn dev   - start rhdh with hot reload"
	@echo ""
	@echo "cluster management:"
	@echo "  make kind-create    - create kind cluster + install kuadrant + demo"
	@echo "  make kind-delete    - delete kind cluster"
	@echo ""
	@echo "kuadrant:"
	@echo "  make kuadrant-install   - install metallb + kuadrant"
	@echo "  make metallb-install    - install metallb (for loadbalancer IPs)"
	@echo "  make demo-install       - install toystore demo"
	@echo "  make demo-uninstall     - remove toystore demo"
	@echo ""
	@echo "cleanup:"
	@echo "  make clean          - delete cluster and cleanup"

# install kind
$(LOCALBIN):
	mkdir -p $(LOCALBIN)

# Include last to avoid changing MAKEFILE_LIST used above
include ./make/*.mk

kind-create: $(KIND) $(HELM)
	@echo "creating kind cluster: $(CLUSTER_NAME)"
	$(KIND) create cluster --name $(CLUSTER_NAME) --config scripts/kind-cluster.yaml
	@kubectl cluster-info --context kind-$(CLUSTER_NAME)
	@echo ""
	@echo "creating rhdh service account and rbac..."
	@kubectl apply -f rbac/rhdh-rbac.yaml
	@echo ""
	@echo "configure kubernetes integration with backstage using rhdh service account..."
	@./scripts/kube-env-setup.sh
	@echo ""
	@echo "installing kuadrant..."
	@$(MAKE) kuadrant-install
	@echo ""
	@echo "installing demo resources..."
	@$(MAKE) demo-install
	@echo ""
	@echo "cluster ready! kuadrant and demo resources installed."
	@echo ""
	@echo "next: cd .. && yarn dev"

kind-delete: $(KIND)
	@echo "deleting kind cluster: $(CLUSTER_NAME)"
	$(KIND) delete cluster --name $(CLUSTER_NAME)

metallb-install:
	@echo "installing metallb..."
	@./scripts/metallb-setup.sh
	@echo ""

kuadrant-install: $(HELM) $(KUSTOMIZE)
	@$(MAKE) metallb-install
	@echo "installing gateway api crds..."
	@kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml
	@echo ""
	@echo "installing istio..."
	@$(HELM) repo add istio https://istio-release.storage.googleapis.com/charts || true
	@$(HELM) repo update
	@kubectl create namespace istio-system --dry-run=client -o yaml | kubectl apply -f -
	@$(HELM) upgrade --install istio-base istio/base -n istio-system --wait
	@$(HELM) upgrade --install istiod istio/istiod -n istio-system --wait
	@echo ""
	@kubectl create namespace kuadrant-system --dry-run=client -o yaml | kubectl apply -f -
	@echo "installing kuadrant operator dependencies for version: $(KUADRANT_VERSION)"
	@$(KUSTOMIZE) build github.com/kuadrant/kuadrant-operator/config/dependencies?ref=$(KUADRANT_VERSION) | kubectl apply --server-side -f -
	@echo ""
	@echo "waiting for kuadrant dependencies..."
	@kubectl -n kuadrant-system wait --timeout=120s --for=condition=Available deployments --all
	@echo ""
	@echo "installing kuadrant operator version: $(KUADRANT_VERSION)"
	@$(KUSTOMIZE) build github.com/kuadrant/kuadrant-operator/config/deploy?ref=$(KUADRANT_VERSION) | kubectl apply --server-side -f -
	@echo ""
	@echo "creating kuadrant instance..."
	@kubectl apply -f kuadrant-instance.yaml
	@echo "waiting for kuadrant instance..."
	@kubectl wait --timeout=120s kuadrant kuadrant -n kuadrant-system --for=condition=Ready
	@echo ""
	@echo "waiting for developer portal controller..."
	@kubectl -n kuadrant-system wait --timeout=120s --for=condition=Available deployments developer-portal-controller
	@echo ""
	@echo "kuadrant version: $(KUADRANT_VERSION) installed!"

demo-install:
	@echo "installing toystore demo resources..."
	@kubectl apply -f demo/toystore-demo.yaml
	@kubectl apply -f demo/gamestore-demo.yaml
	@kubectl apply -f demo/additional-demos.yaml
	@echo ""
	@echo "demo resources installed!"
	@echo ""
	@echo "verify with:"
	@echo "  kubectl get pods -n toystore"
	@echo "  kubectl get apiproducts -n toystore"

demo-uninstall:
	@echo "uninstalling demo resources..."
	@kubectl delete -f demo/toystore-demo.yaml --ignore-not-found
	@kubectl delete -f demo/gamestore-demo.yaml --ignore-not-found
	@kubectl delete -f demo/additional-demos.yaml --ignore-not-found
	@echo "demo resources removed"

clean: kind-delete
	@echo "cleaning up bin directory..."
	@rm -rf $(LOCALBIN)
	@echo "cleanup complete"
