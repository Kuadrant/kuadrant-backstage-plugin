.PHONY: help kind-create kind-delete kuadrant-install controller-deploy demo-install demo-uninstall clean

CLUSTER_NAME ?= local-cluster
LOCALBIN ?= $(shell pwd)/bin
KIND_VERSION ?= v0.20.0
HELM_VERSION ?= v3.15.0

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
	@echo "  make kuadrant-install   - install kuadrant v1.3.0"
	@echo "  make controller-deploy  - build and deploy devportal controller"
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

kuadrant-install: $(HELM)
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
	@echo "installing kuadrant operator v1.3.0..."
	@kubectl create namespace kuadrant-system --dry-run=client -o yaml | kubectl apply -f -
	@$(HELM) repo add kuadrant https://kuadrant.io/helm-charts/ 2>/dev/null || true
	@$(HELM) repo update kuadrant
	@$(HELM) upgrade --install kuadrant-operator kuadrant/kuadrant-operator \
		--version 1.3.0 \
		-n kuadrant-system \
		--wait
	@echo ""
	@echo "creating kuadrant instance..."
	@kubectl apply -f kuadrant-instance.yaml
	@echo ""
	@echo "deploying devportal controller..."
	@$(MAKE) controller-deploy
	@echo ""
	@echo "kuadrant v1.3.0 installed!"

# deploy devportal-controller from local sibling directory
CONTROLLER_DIR ?= $(shell pwd)/../../developer-portal-controller

controller-deploy: $(LOCALBIN)/kind-$(KIND_VERSION)
	@echo "deploying devportal controller from $(CONTROLLER_DIR)..."
	@if [ ! -d "$(CONTROLLER_DIR)" ]; then \
		echo "error: controller directory not found at $(CONTROLLER_DIR)"; \
		echo "clone: git clone https://github.com/Kuadrant/developer-portal-controller.git $(CONTROLLER_DIR)"; \
		exit 1; \
	fi
	@echo "building controller image..."
	@$(MAKE) -C $(CONTROLLER_DIR) docker-build
	@echo "loading controller image into kind cluster..."
	@$(LOCALBIN)/kind-$(KIND_VERSION) load docker-image controller:latest --name $(CLUSTER_NAME)
	@echo "installing CRDs and deploying controller..."
	@$(MAKE) -C $(CONTROLLER_DIR) install deploy
	@echo "patching imagePullPolicy for local image..."
	@kubectl patch deployment -n developer-portal-controller-system developer-portal-controller-controller-manager \
		-p '{"spec":{"template":{"spec":{"containers":[{"name":"manager","imagePullPolicy":"IfNotPresent"}]}}}}'
	@echo "devportal controller deployed!"

demo-install:
	@echo "installing toystore demo resources..."
	@kubectl apply -f demo/toystore-demo.yaml
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
	@kubectl delete -f demo/additional-demos.yaml --ignore-not-found
	@echo "demo resources removed"

clean: kind-delete
	@echo "cleaning up bin directory..."
	@rm -rf $(LOCALBIN)
	@echo "cleanup complete"
