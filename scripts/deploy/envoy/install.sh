#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?version required}"

echo "=== Cleaning old Envoy ==="
kubectl delete -f https://github.com/envoyproxy/gateway/releases/latest/download/install.yaml --ignore-not-found=true || true
kubectl delete ns envoy-gateway-system --ignore-not-found=true || true

echo "=== Installing Gateway API ==="
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml

echo "=== Installing Envoy Gateway ${VERSION} ==="
kubectl apply --server-side -f "https://github.com/envoyproxy/gateway/releases/download/${VERSION}/install.yaml"

echo "=== Waiting for Envoy deployment ==="
for i in $(seq 1 30); do
  READY=$(kubectl -n envoy-gateway-system get deploy envoy-gateway -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
  echo "Attempt $i: ReadyReplicas=$READY"
  if [ "$READY" = "1" ]; then
    echo "Envoy is ready"
    break
  fi
  sleep 10
done

READY=$(kubectl -n envoy-gateway-system get deploy envoy-gateway -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [ "$READY" != "1" ]; then
  echo "❌ Envoy failed to start"
  kubectl get pods -n envoy-gateway-system
  kubectl describe pods -n envoy-gateway-system
  kubectl logs -n envoy-gateway-system deploy/envoy-gateway || true
  exit 1
fi

echo "=== Creating TLS Secret ==="
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /tmp/perf-tls.key \
  -out /tmp/perf-tls.crt \
  -subj "/CN=perf.example.com"

kubectl delete secret perf-tls -n default --ignore-not-found
kubectl create secret tls perf-tls \
  --cert=/tmp/perf-tls.crt \
  --key=/tmp/perf-tls.key \
  -n default

echo "=== Envoy installation completed ==="