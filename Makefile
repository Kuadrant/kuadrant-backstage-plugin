.PHONY: help dev dev-rhdh install build export deploy clean kind-create kind-delete kuadrant-install kuadrant-uninstall demo-install demo-uninstall rhdh-setup rhdh-submodule-init

CLUSTER_NAME ?= local-cluster
PLUGIN_DIR := kuadrant-backstage/plugins
RHDH_LOCAL := rhdh-local
RHDH_OVERLAY := rhdh-config-overlay
FRONTEND_PLUGIN := kuadrant
BACKEND_PLUGIN := kuadrant-backend

help:
	@echo "kuadrant backstage plugin - development"
	@echo ""
	@echo "rhdh setup:"
	@echo "  make rhdh-submodule-init - initialise rhdh-local submodule"
	@echo "  make rhdh-setup          - apply customisations to rhdh-local"
	@echo ""
	@echo "rhdh development:"
	@echo "  make dev                 - start rhdh with plugins"
	@echo "  make deploy              - rebuild plugins and restart rhdh (use after code changes)"
	@echo ""
	@echo "plugin development:"
	@echo "  make install             - install plugin dependencies"
	@echo "  make build               - build both plugins"
	@echo "  make export              - export plugins as dynamic plugins"
	@echo ""
	@echo "kubernetes cluster (required):"
	@echo "  make kind-create         - create kind cluster with kuadrant v1.3.0-alpha2"
	@echo "  make kind-delete         - delete kind cluster"
	@echo "  make kuadrant-install    - install kuadrant v1.3.0-alpha2 on existing cluster"
	@echo "  make kuadrant-uninstall  - uninstall kuadrant"
	@echo "  make demo-install        - install toystore demo resources"
	@echo "  make demo-uninstall      - uninstall toystore demo resources"
	@echo "  make gateway-forward     - port-forward to gateway for testing (ctrl-c to stop)"
	@echo ""
	@echo "cleanup:"
	@echo "  make clean               - stop rhdh and delete kind cluster"
	@echo ""
	@echo "quick start:"
	@echo "  make kind-create && make dev"

# install plugin dependencies
install:
	@echo "installing frontend plugin dependencies..."
	@cd $(PLUGIN_DIR)/$(FRONTEND_PLUGIN) && yarn install
	@echo ""
	@echo "installing backend plugin dependencies..."
	@cd $(PLUGIN_DIR)/$(BACKEND_PLUGIN) && yarn install
	@echo ""
	@echo "dependencies installed"

# build both plugins
build:
	@echo "building frontend plugin..."
	@cd $(PLUGIN_DIR)/$(FRONTEND_PLUGIN) && yarn build
	@echo ""
	@echo "building backend plugin..."
	@cd $(PLUGIN_DIR)/$(BACKEND_PLUGIN) && yarn build
	@echo ""
	@echo "plugins built"

# export plugins as dynamic plugins
export: build
	@echo "exporting frontend plugin..."
	@cd $(PLUGIN_DIR)/$(FRONTEND_PLUGIN) && npx @red-hat-developer-hub/cli@latest plugin export
	@echo ""
	@echo "exporting backend plugin..."
	@cd $(PLUGIN_DIR)/$(BACKEND_PLUGIN) && npx @red-hat-developer-hub/cli@latest plugin export
	@echo ""
	@echo "copying plugins to rhdh-local..."
	@rm -rf $(RHDH_LOCAL)/local-plugins/$(FRONTEND_PLUGIN)
	@rm -rf $(RHDH_LOCAL)/local-plugins/$(BACKEND_PLUGIN)
	@cp -r $(PLUGIN_DIR)/$(FRONTEND_PLUGIN)/dist-dynamic $(RHDH_LOCAL)/local-plugins/$(FRONTEND_PLUGIN)
	@cp -r $(PLUGIN_DIR)/$(BACKEND_PLUGIN)/dist-dynamic $(RHDH_LOCAL)/local-plugins/$(BACKEND_PLUGIN)
	@echo "plugins exported to $(RHDH_LOCAL)/local-plugins/"

# build, export, and restart rhdh (full deployment)
deploy: export
	@echo "removing old plugin installations to force refresh..."
	@rm -rf $(RHDH_LOCAL)/dynamic-plugins-root/internal-plugin-kuadrant-dynamic-0.1.0 || true
	@rm -rf $(RHDH_LOCAL)/dynamic-plugins-root/internal-plugin-kuadrant-backend-dynamic-0.1.0 || true
	@echo ""
	@echo "installing dynamic plugins..."
	@cd $(RHDH_LOCAL) && docker compose run --rm install-dynamic-plugins
	@echo ""
	@echo "restarting rhdh..."
	@cd $(RHDH_LOCAL) && docker compose down && docker compose up -d
	@echo ""
	@echo "rhdh restarted at http://localhost:7008"
	@echo "waiting for rhdh to start..."
	@sleep 8
	@echo ""
	@echo "checking plugin loading..."
	@docker logs rhdh 2>&1 | grep -i "kuadrant\|Plugin initialization" | tail -5 || true
	@echo ""
	@echo "deployment complete! visit http://localhost:7008/kuadrant"

# fast iterative development - copy directly to container
dev-update: export
	@echo "copying plugins directly to container..."
	@docker cp $(RHDH_LOCAL)/local-plugins/kuadrant/. rhdh:/opt/app-root/src/dynamic-plugins-root/internal-plugin-kuadrant-dynamic-0.1.0/
	@docker cp $(RHDH_LOCAL)/local-plugins/kuadrant-backend/. rhdh:/opt/app-root/src/dynamic-plugins-root/internal-plugin-kuadrant-backend-dynamic-0.1.0/
	@echo ""
	@echo "restarting rhdh container..."
	@cd $(RHDH_LOCAL) && docker compose stop rhdh && docker compose start rhdh
	@echo ""
	@echo "waiting for restart..."
	@sleep 10
	@echo ""
	@echo "updated! visit http://localhost:7008/kuadrant"
	@echo "hard refresh browser (cmd+shift+r) to see changes"

# start rhdh with plugins
dev:
	@echo "starting rhdh development environment..."
	@echo ""
	@echo "checking if cluster exists..."
	@if kind get clusters 2>/dev/null | grep -q "^$(CLUSTER_NAME)$$"; then \
		echo "cluster exists, regenerating kubeconfig..."; \
		$(MAKE) rhdh-kubeconfig; \
	else \
		echo "cluster does not exist. run 'make kind-create' first."; \
		exit 1; \
	fi
	@echo ""
	@echo "checking if plugins are built..."
	@if [ ! -d "$(PLUGIN_DIR)/$(FRONTEND_PLUGIN)/dist" ] || [ ! -d "$(PLUGIN_DIR)/$(BACKEND_PLUGIN)/dist" ]; then \
		echo "plugins not built, building now..."; \
		$(MAKE) build; \
	fi
	@echo ""
	@echo "checking if plugins are exported..."
	@if [ ! -d "$(RHDH_LOCAL)/local-plugins/$(FRONTEND_PLUGIN)" ] || [ ! -d "$(RHDH_LOCAL)/local-plugins/$(BACKEND_PLUGIN)" ]; then \
		echo "plugins not exported, exporting now..."; \
		$(MAKE) export; \
	fi
	@echo ""
	@echo "installing dynamic plugins..."
	@cd $(RHDH_LOCAL) && docker compose run --rm install-dynamic-plugins
	@echo ""
	@echo "starting rhdh..."
	@cd $(RHDH_LOCAL) && docker compose up -d
	@echo ""
	@echo "rhdh started at http://localhost:7008"
	@echo "waiting for rhdh to start..."
	@sleep 8
	@echo ""
	@echo "checking plugin loading..."
	@docker logs rhdh 2>&1 | grep -i "kuadrant\|Plugin initialization" | tail -5 || true
	@echo ""
	@echo "development environment ready!"
	@echo ""
	@echo "visit: http://localhost:7008/kuadrant"
	@echo ""
	@echo "to rebuild and redeploy after changes:"
	@echo "  make deploy"

# create kind cluster with kuadrant
kind-create:
	@echo "creating kind cluster: $(CLUSTER_NAME)"
	@printf 'kind: Cluster\napiVersion: kind.x-k8s.io/v1alpha4\nnodes:\n- role: control-plane\n  extraPortMappings:\n  - containerPort: 30007\n    hostPort: 7007\n    protocol: TCP\n' | kind create cluster --name $(CLUSTER_NAME) --config=- || true
	@kubectl cluster-info --context kind-$(CLUSTER_NAME)
	@echo ""
	@echo "creating rhdh service account and rbac..."
	@kubectl apply -f rhdh-rbac.yaml
	@echo ""
	@echo "generating rhdh kubeconfig..."
	@$(MAKE) rhdh-kubeconfig
	@echo ""
	@echo "installing kuadrant..."
	@$(MAKE) kuadrant-install
	@echo ""
	@echo "installing demo resources..."
	@$(MAKE) demo-install
	@echo ""
	@echo "cluster ready! kuadrant and demo resources installed."
	@echo ""
	@echo "next: make dev"

# initialise rhdh-local submodule
rhdh-submodule-init:
	@echo "initialising rhdh-local submodule..."
	@git submodule add https://github.com/redhat-developer/rhdh-local.git $(RHDH_LOCAL) || echo "submodule already exists"
	@git submodule update --init --recursive
	@echo ""
	@echo "submodule initialised. next: make rhdh-setup"

# apply customisations to rhdh-local
rhdh-setup:
	@echo "applying customisations to rhdh-local..."
	@mkdir -p $(RHDH_LOCAL)/configs/extra-files/.kube
	@cp $(RHDH_OVERLAY)/kubeconfig.yaml $(RHDH_LOCAL)/configs/extra-files/.kube/config
	@cp $(RHDH_OVERLAY)/app-config.local.yaml $(RHDH_LOCAL)/configs/app-config/
	@cp $(RHDH_OVERLAY)/dynamic-plugins.override.yaml $(RHDH_LOCAL)/configs/dynamic-plugins/
	@cp $(RHDH_OVERLAY)/toystore.yaml $(RHDH_LOCAL)/configs/catalog-entities/
	@cp $(RHDH_OVERLAY)/.env $(RHDH_LOCAL)/
	@echo "patching compose.yaml..."
	@$(RHDH_OVERLAY)/patch-compose.sh $(RHDH_LOCAL)/compose.yaml
	@echo ""
	@echo "customisations applied. rhdh-local ready for use."

# generate kubeconfig for rhdh with service account token
rhdh-kubeconfig:
	@echo "generating kubeconfig for rhdh service account..."
	@RHDH_TOKEN=$$(kubectl create token rhdh -n default --duration=999999h) && \
	CA_DATA=$$(kubectl config view --minify --raw -o jsonpath='{.clusters[0].cluster.certificate-authority-data}') && \
	printf "apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    certificate-authority-data: %s\n    server: https://local-cluster-control-plane:6443\n  name: kind-local-cluster\ncontexts:\n- context:\n    cluster: kind-local-cluster\n    user: rhdh\n  name: kind-local-cluster\ncurrent-context: kind-local-cluster\nusers:\n- name: rhdh\n  user:\n    token: %s\n" "$$CA_DATA" "$$RHDH_TOKEN" > $(RHDH_OVERLAY)/kubeconfig.yaml && \
	mkdir -p $(RHDH_LOCAL)/configs/extra-files/.kube && \
	cp $(RHDH_OVERLAY)/kubeconfig.yaml $(RHDH_LOCAL)/configs/extra-files/.kube/config && \
	cp $(RHDH_OVERLAY)/.env $(RHDH_LOCAL)/ && \
	echo "kubeconfig generated and copied to rhdh-local/configs/extra-files/.kube/config"

# install kuadrant on existing cluster
kuadrant-install:
	@echo "installing gateway api crds..."
	@kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml
	@echo ""
	@echo "installing istio..."
	@helm repo add istio https://istio-release.storage.googleapis.com/charts || true
	@helm repo update
	@kubectl create namespace istio-system --dry-run=client -o yaml | kubectl apply -f -
	@helm upgrade --install istio-base istio/base -n istio-system --wait
	@helm upgrade --install istiod istio/istiod -n istio-system --wait
	@echo ""
	@echo "installing kuadrant operator v1.3.0-rc2 (with extensions enabled)..."
	@kubectl create namespace kuadrant-system --dry-run=client -o yaml | kubectl apply -f -
	@helm repo add kuadrant https://kuadrant.io/helm-charts/ 2>/dev/null || true
	@helm repo update kuadrant
	@helm upgrade --install kuadrant-operator kuadrant/kuadrant-operator \
		--version 1.3.0-rc2 \
		--devel \
		-n kuadrant-system \
		--wait
	@echo ""
	@echo "creating kuadrant instance..."
	@kubectl apply -f kuadrant-instance.yaml
	@echo ""
	@echo "installing planpolicy crd (alpha feature)..."
	@kubectl apply -f https://raw.githubusercontent.com/Kuadrant/kuadrant-operator/main/config/crd/bases/extensions.kuadrant.io_planpolicies.yaml
	@echo ""
	@echo "creating rhdh service account and rbac..."
	@kubectl apply -f rhdh-rbac.yaml
	@echo ""
	@echo "kuadrant installed! verify with:"
	@echo "  kubectl get pods -n kuadrant-system"
	@echo "  kubectl get pods -n istio-system"
	@echo "  kubectl get kuadrant -n kuadrant-system"
	@echo "  kubectl get crd planpolicies.extensions.kuadrant.io"

# uninstall kuadrant
kuadrant-uninstall:
	@echo "uninstalling kuadrant..."
	@kubectl delete -f kuadrant-instance.yaml || true
	@helm uninstall kuadrant-operator -n kuadrant-system || true
	@kubectl delete namespace kuadrant-system || true
	@helm uninstall istiod -n istio-system || true
	@helm uninstall istio-base -n istio-system || true
	@kubectl delete namespace istio-system || true
	@kubectl delete -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml || true
	@echo "kuadrant uninstalled"

# delete kind cluster
kind-delete:
	@echo "deleting kind cluster: $(CLUSTER_NAME)"
	@kind delete cluster --name $(CLUSTER_NAME)

# install demo resources
demo-install:
	@echo "installing toystore demo resources (gateway, httproute, authpolicy, planpolicy, secrets)..."
	@kubectl apply -f toystore-demo.yaml
	@echo ""
	@echo "demo resources installed!"
	@echo ""
	@echo "verify with:"
	@echo "  kubectl get pods -n toystore"
	@echo "  kubectl get authpolicies -n toystore"
	@echo "  kubectl get ratelimitpolicies -n toystore"
	@echo "  kubectl get planpolicies -n toystore"
	@echo "  kubectl get secrets -n toystore"

# uninstall demo resources
demo-uninstall:
	@echo "uninstalling toystore demo resources..."
	@kubectl delete -f toystore-demo.yaml || true
	@echo "demo resources uninstalled"

# port-forward to gateway for testing
gateway-forward:
	@echo "port-forwarding to gateway..."
	@echo ""
	@echo "gateway will be available at http://localhost:8080"
	@echo ""
	@echo "current rate limit: 5 requests per 10 seconds (all authenticated users)"
	@echo ""
	@echo "test with api keys:"
	@echo "  alice (gold plan):"
	@echo "    curl -H 'Host: api.toystore.com' -H 'Authorization: APIKEY secret-alice-key' http://localhost:8080/"
	@echo "  bob (silver plan):"
	@echo "    curl -H 'Host: api.toystore.com' -H 'Authorization: APIKEY secret-bob-key' http://localhost:8080/"
	@echo ""
	@echo "to see rate limiting (429 after 5 requests):"
	@echo "  for i in 1 2 3 4 5 6 7 8; do curl -s -o /dev/null -w \"Request \$$i: HTTP %{http_code}\\\n\" -H 'Host: api.toystore.com' -H 'Authorization: APIKEY secret-bob-key' http://localhost:8080/; done"
	@echo ""
	@kubectl port-forward -n api-gateway svc/external-istio 8080:80

# cleanup everything
clean:
	@echo "stopping rhdh..."
	@cd $(RHDH_LOCAL) && docker compose down || true
	@echo ""
	@$(MAKE) kind-delete
	@echo ""
	@echo "cleanup complete"


