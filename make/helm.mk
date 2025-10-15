##@ Helm

HELM_VERSION = v3.15.0
HELM_V_BINARY := $(LOCALBIN)/helm-$(HELM_VERSION)

$(HELM_V_BINARY): $(LOCALBIN)  ## Installs helm in $PROJECT_DIR/bin
# Download helm binary depending on architecture and OS
ifeq ($(shell uname -s),Darwin)
  # macOS
  ifeq ($(shell uname -m),arm64)
	@{ \
	set -e ;\
	curl -Lo helm.tar.gz https://get.helm.sh/helm-$(HELM_VERSION)-darwin-arm64.tar.gz ;\
	tar -zxvf helm.tar.gz ;\
	mv darwin-arm64/helm $@ ;\
	chmod +x $@ ;\
	rm -rf darwin-arm64 helm.tar.gz ;\
	}
  else
	@{ \
	set -e ;\
	curl -Lo helm.tar.gz https://get.helm.sh/helm-$(HELM_VERSION)-darwin-amd64.tar.gz ;\
	tar -zxvf helm.tar.gz ;\
	mv darwin-amd64/helm $@ ;\
	chmod +x $@ ;\
	rm -rf darwin-amd64 helm.tar.gz ;\
	}
  endif
else
  # Linux
  ifeq ($(shell uname -m),aarch64)
	@{ \
	set -e ;\
	curl -Lo helm.tar.gz https://get.helm.sh/helm-$(HELM_VERSION)-linux-arm64.tar.gz ;\
	tar -zxvf helm.tar.gz ;\
	mv linux-arm64/helm $@ ;\
	chmod +x $@ ;\
	rm -rf linux-arm64 helm.tar.gz ;\
	}
  else
	@{ \
	set -e ;\
	curl -Lo helm.tar.gz https://get.helm.sh/helm-$(HELM_VERSION)-linux-amd64.tar.gz ;\
	tar -zxvf helm.tar.gz ;\
	mv linux-amd64/helm $@ ;\
	chmod +x $@ ;\
	rm -rf linux-amd64 helm.tar.gz ;\
	}
  endif
endif


.PHONY: helm
helm: $(HELM_V_BINARY) ## Download helm locally if necessary.
