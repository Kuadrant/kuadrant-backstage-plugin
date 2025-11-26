#!/bin/bash

# Script to gather required config to setup kubernetes integration with backstage
# Requires kube session active
# Specifically:
#   * sets cluster URL in K8S_URL (.envs)
#   * sets rhdh service account token in K8S_CLUSTER_TOKEN (.envs)
# Usage: ./sripts/kube-env-setup.sh

