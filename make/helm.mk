##@ Helm

HELM_VERSION = v3.15.0
HELM_V_BINARY := $(LOCALBIN)/helm-$(HELM_VERSION)

$(HELM_V_BINARY): $(LOCALBIN)  ## Installs helm in $PROJECT_DIR/bin
# For AMD64 / x86_64
ifeq ($(shell uname -p),x86_64)
	@{ \
	set -e ;\
	curl -Lo helm.tar.gz https://get.helm.sh/helm-$(HELM_VERSION)-linux-amd64.tar.gz ;\
	tar -zxvf helm.tar.gz ;\
	mv linux-amd64/helm $@ ;\
	chmod +x $@ ;\
	rm -rf linux-amd64 helm.tar.gz ;\
	}
endif
# For ARM64
ifeq ($(shell uname -p),aarch64)
	@{ \
	set -e ;\
	curl -Lo helm.tar.gz https://get.helm.sh/helm-$(HELM_VERSION)-linux-arm64.tar.gz ;\
	tar -zxvf helm.tar.gz ;\
	mv linux-arm64/helm $@ ;\
	chmod +x $@ ;\
	rm -rf linux-amd64 helm.tar.gz ;\
	}
endif

.PHONY: helm
helm: $(HELM_V_BINARY) ## Download helm locally if necessary.
