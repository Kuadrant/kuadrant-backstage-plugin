##@ Tools

HELM_VERSION ?= v3.15.0
HELM = $(LOCALBIN)/helm-$(HELM_VERSION)

# install helm
$(LOCALBIN)/helm-$(HELM_VERSION): $(LOCALBIN)
	@if [ -f "$@" ]; then \
		echo "helm $(HELM_VERSION) already exists at $@"; \
	else \
		echo "downloading helm $(HELM_VERSION)..."; \
		if [ "$$(uname -s)" = "Darwin" ]; then \
			if [ "$$(uname -m)" = "arm64" ]; then \
				curl -Lo $(LOCALBIN)/helm.tar.gz https://get.helm.sh/helm-$(HELM_VERSION)-darwin-arm64.tar.gz; \
			else \
				curl -Lo $(LOCALBIN)/helm.tar.gz https://get.helm.sh/helm-$(HELM_VERSION)-darwin-amd64.tar.gz; \
			fi; \
		else \
			if [ "$$(uname -m)" = "aarch64" ]; then \
				curl -Lo $(LOCALBIN)/helm.tar.gz https://get.helm.sh/helm-$(HELM_VERSION)-linux-arm64.tar.gz; \
			else \
				curl -Lo $(LOCALBIN)/helm.tar.gz https://get.helm.sh/helm-$(HELM_VERSION)-linux-amd64.tar.gz; \
			fi; \
		fi; \
		tar -zxvf $(LOCALBIN)/helm.tar.gz -C $(LOCALBIN); \
		if [ "$$(uname -s)" = "Darwin" ]; then \
			mv $(LOCALBIN)/darwin-*/helm $@; \
		else \
			mv $(LOCALBIN)/linux-*/helm $@; \
		fi; \
		rm -rf $(LOCALBIN)/helm.tar.gz $(LOCALBIN)/darwin-* $(LOCALBIN)/linux-*; \
		chmod +x $@; \
	fi

KIND_VERSION ?= v0.20.0
KIND = $(LOCALBIN)/kind-$(KIND_VERSION)

$(LOCALBIN)/kind-$(KIND_VERSION): $(LOCALBIN)
	@if [ -f "$@" ]; then \
		echo "kind $(KIND_VERSION) already exists at $@"; \
	else \
		echo "downloading kind $(KIND_VERSION)..."; \
		if [ "$$(uname -s)" = "Darwin" ]; then \
			if [ "$$(uname -m)" = "arm64" ]; then \
				curl -Lo $@ https://kind.sigs.k8s.io/dl/$(KIND_VERSION)/kind-darwin-arm64; \
			else \
				curl -Lo $@ https://kind.sigs.k8s.io/dl/$(KIND_VERSION)/kind-darwin-amd64; \
			fi; \
		else \
			if [ "$$(uname -m)" = "aarch64" ]; then \
				curl -Lo $@ https://kind.sigs.k8s.io/dl/$(KIND_VERSION)/kind-linux-arm64; \
			else \
				curl -Lo $@ https://kind.sigs.k8s.io/dl/$(KIND_VERSION)/kind-linux-amd64; \
			fi; \
		fi; \
		chmod +x $@; \
	fi

KUSTOMIZE_VERSION ?= v5.6.0
KUSTOMIZE := $(LOCALBIN)/kustomize-$(KUSTOMIZE_VERSION)

$(KUSTOMIZE): | $(LOCALBIN)  ## Installs kustomize in $PROJECT_DIR/bin
# For AMD64 / x86_64
ifeq ($(shell uname -p),x86_64)
	@{ \
	set -e ;\
	curl -Lo kustomize.tar.gz https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize/$(KUSTOMIZE_VERSION)/kustomize_$(KUSTOMIZE_VERSION)_linux_amd64.tar.gz ;\
	tar -zxvf kustomize.tar.gz ;\
	mv ./kustomize $@ ;\
	chmod +x $@ ;\
	rm -rf kustomize.tar.gz ;\
	}
endif
# For ARM64
ifeq ($(shell uname -s),Darwin)
ifeq ($(shell uname -m),arm64)
	@{ \
	set -e ;\
	curl -Lo kustomize.tar.gz https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize/$(KUSTOMIZE_VERSION)/kustomize_$(KUSTOMIZE_VERSION)_linux_arm64.tar.gz ;\
	tar -zxvf kustomize.tar.gz ;\
	mv ./kustomize $@ ;\
	chmod +x $@ ;\
	rm -rf kustomize.tar.gz ;\
	}
endif
endif

.PHONY: kustomize
kustomize: $(KUSTOMIZE) ## Download kustomize locally if necessary.
	@$(KUSTOMIZE) version
