#!/usr/bin/env bash
set -euo pipefail

GATEWAY="${1:?gateway required}"

case "${GATEWAY}" in
  envoy)
    echo "Cleaning Envoy Gateway"
    kubectl delete -f https://github.com/envoyproxy/gateway/releases/latest/download/install.yaml --ignore-not-found=true || true
    kubectl delete ns envoy-gateway-system --ignore-not-found=true || true
    ;;
  ngf)
    echo "Cleaning NGINX Gateway Fabric"
    kubectl delete -f https://raw.githubusercontent.com/nginxinc/nginx-gateway-fabric/v2.4.2/deploy/default/deploy.yaml --ignore-not-found || true
    kubectl delete -f https://raw.githubusercontent.com/nginxinc/nginx-gateway-fabric/v2.4.2/deploy/crds.yaml --ignore-not-found || true
    kubectl delete ns nginx-gateway --ignore-not-found=true || true
    ;;
  cilium)
    echo "Cleaning Cilium safely"
    if command -v cilium >/dev/null 2>&1; then
      cilium uninstall || true
    fi
    kubectl delete daemonset cilium -n kube-system --ignore-not-found || true
    kubectl delete configmap cilium-config -n kube-system --ignore-not-found || true
    kubectl delete deployment cilium-operator -n kube-system --ignore-not-found || true
    kubectl delete deployment cilium-operator-generic -n kube-system --ignore-not-found || true
    ;;
  *)
    echo "Unsupported gateway cleanup target: ${GATEWAY}"
    exit 1
    ;;
esac