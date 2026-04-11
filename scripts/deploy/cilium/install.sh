#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?version required}"

if ! command -v cilium >/dev/null 2>&1; then
  echo "cilium CLI is required on the master node"
  exit 1
fi

kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml

cilium install --version "${VERSION}"
cilium status --wait

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /tmp/perf-tls.key \
  -out /tmp/perf-tls.crt \
  -subj "/CN=perf.example.com"

kubectl delete secret perf-tls -n default --ignore-not-found
kubectl create secret tls perf-tls \
  --cert=/tmp/perf-tls.crt \
  --key=/tmp/perf-tls.key \
  -n default