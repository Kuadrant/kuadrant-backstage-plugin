.PHONY: help preflight dynamic-build e2e-deps dynamic-cluster dynamic-up \
	e2e-specs e2e-dynamic teardown

MAKEFLAGS += --no-print-directory

OINC_VERSION ?= v0.3.1
OCP_VERSION ?= 4.21
KUADRANT_VERSION ?= 1.5.1
RHDH_BASE_IMAGE ?= quay.io/rhdh-community/rhdh:1.10
RHDH_IMAGE_REPOSITORY ?= localhost/kuadrant-rhdh-e2e
RHDH_IMAGE_TAG ?= ci
RHDH_CHART_VERSION ?= 6.2.2
RHDH_URL ?= http://rhdh.localhost:9080
DEX_URL ?= http://dex.localhost:9080
PLAYWRIGHT_INSTALL_ARGS ?=
PLAYWRIGHT_ARGS ?=

RHDH_IMAGE = $(RHDH_IMAGE_REPOSITORY):$(RHDH_IMAGE_TAG)

export OCP_VERSION KUADRANT_VERSION RHDH_BASE_IMAGE RHDH_IMAGE_REPOSITORY
export RHDH_IMAGE_TAG RHDH_CHART_VERSION RHDH_URL DEX_URL

help:
	@echo "Dynamic-plugin RHDH testing:"
	@echo "  make dynamic-up   build and start RHDH for manual testing"
	@echo "  make e2e-deps     install the Playwright test dependencies"
	@echo "  make e2e-specs    run the full e2e suite against a running RHDH"
	@echo "  make e2e-dynamic  run the full build, test and teardown path"
	@echo "  make teardown     delete the oinc cluster"
	@echo ""
	@echo "Override versions and image settings on the make command line."

preflight:
	@for tool in node yarn helm docker kubectl curl python3 oinc; do \
		command -v $$tool >/dev/null 2>&1 || { echo "error: '$$tool' not found on PATH"; exit 1; }; \
	done
	@docker info >/dev/null 2>&1 || { echo "error: docker is not running"; exit 1; }
	@version=$$(oinc version 2>/dev/null | grep -o 'v[0-9][^[:space:]]*' | head -1); \
	case "$$version" in \
		$(OINC_VERSION)|$(OINC_VERSION)-*) ;; \
		*) echo "error: oinc $(OINC_VERSION) required, found $${version:-unknown}"; exit 1 ;; \
	esac

dynamic-build:
	yarn install --immutable
	TURBO_FORCE=1 yarn build
	cd plugins/kuadrant && yarn export-dynamic
	cd plugins/kuadrant-backend && yarn export-dynamic
	docker build -f e2e-tests/rhdh/Dockerfile \
		--build-arg RHDH_BASE_IMAGE="$(RHDH_BASE_IMAGE)" \
		-t "$(RHDH_IMAGE)" .

# Kept separate so manual browser testing does not install Playwright.
e2e-deps:
	cd e2e-tests && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 yarn install --immutable
	cd e2e-tests && yarn playwright install $(PLAYWRIGHT_INSTALL_ARGS) chromium

dynamic-cluster:
	./oinc/setup-cluster.sh
	oinc load-image "$(RHDH_IMAGE)"
	PLUGIN_SOURCE=baked ./oinc/setup-rhdh.sh
	BASE_URL="$(RHDH_URL)" ./e2e-tests/rhdh/wait-for-catalog.sh

dynamic-up: preflight dynamic-build dynamic-cluster
	@echo ""
	@echo "RHDH is ready at $(RHDH_URL) (Dex: $(DEX_URL))."
	@echo "Run 'make e2e-deps e2e-specs' for the tests, or 'make teardown' when done."

e2e-specs:
	@curl -fsS -o /dev/null --max-time 10 "$(RHDH_URL)" || { \
		echo "error: no RHDH responding at $(RHDH_URL); run 'make dynamic-up' first"; \
		exit 1; \
	}
	cd e2e-tests && BASE_URL="$(RHDH_URL)" yarn test $(PLAYWRIGHT_ARGS)

teardown:
	./oinc/teardown.sh

# Leave a failed local environment running for inspection. CI always invokes the
# teardown target in its own `if: always()` step.
e2e-dynamic: preflight dynamic-build e2e-deps
	@if ! ( $(MAKE) dynamic-cluster && CI=1 $(MAKE) e2e-specs ); then \
		echo "dynamic e2e failed; the cluster is available for inspection"; \
		echo "  RHDH: $(RHDH_URL)"; \
		echo "  logs: kubectl -n rhdh logs -l app.kubernetes.io/component=backstage --all-containers --tail=300"; \
		echo "  stop: make teardown"; \
		exit 1; \
	fi
	@$(MAKE) teardown
