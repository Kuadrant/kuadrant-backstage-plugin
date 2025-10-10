##@ Kind

## Targets to help install and use kind for development https://kind.sigs.k8s.io

KIND_VERSION ?= v0.20.0
KIND_V_BINARY := $(LOCALBIN)/kind-$(KIND_VERSION)

.PHONY: kind
kind: $(KIND_V_BINARY)

$(KIND_V_BINARY): $(LOCALBIN)  ## Installs kind in $PROJECT_DIR/bin
# For AMD64 / x86_64
ifeq ($(shell uname -p),x86_64)
	curl -Lo $@ https://kind.sigs.k8s.io/dl/$(KIND_VERSION)/kind-linux-amd64
endif
# For ARM64
ifeq ($(shell uname -p),aarch64)
	curl -Lo $@ https://kind.sigs.k8s.io/dl/$(KIND_VERSION)/kind-linux-arm64
endif
	chmod +x $@

.PHONY: kind-create-cluster
kind-create-cluster: kind ## Create the "kuadrant-local" kind cluster.
	$(KIND_V_BINARY) create cluster --name $(CLUSTER_NAME) --config utils/kind-cluster.yaml

.PHONY: kind-delete-cluster
kind-delete-cluster: kind ## Delete the "kuadrant-local" kind cluster.
	@echo "deleting kind cluster: $(CLUSTER_NAME)"
	- $(KIND_V_BINARY) delete cluster --name $(CLUSTER_NAME)
