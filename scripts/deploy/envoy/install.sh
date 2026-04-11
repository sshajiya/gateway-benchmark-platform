#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?version required}"

kubectl delete -f https://github.com/envoyproxy/gateway/releases/latest/download/install.yaml --ignore-not-found=true || true
kubectl delete ns envoy-gateway-system --ignore-not-found=true || true

kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml
kubectl apply --server-side -f "https://github.com/envoyproxy/gateway/releases/download/${VERSION}/install.yaml"

kubectl -n envoy-gateway-system rollout status deployment/envoy-gateway --timeout=240s

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /tmp/perf-tls.key \
  -out /tmp/perf-tls.crt \
  -subj "/CN=perf.example.com"

kubectl delete secret perf-tls -n default --ignore-not-found
kubectl create secret tls perf-tls \
  --cert=/tmp/perf-tls.crt \
  --key=/tmp/perf-tls.key \
  -n default