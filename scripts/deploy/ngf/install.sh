#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?version required}"

kubectl delete -f https://raw.githubusercontent.com/nginxinc/nginx-gateway-fabric/v2.4.2/deploy/default/deploy.yaml --ignore-not-found || true
kubectl delete -f https://raw.githubusercontent.com/nginxinc/nginx-gateway-fabric/v2.4.2/deploy/crds.yaml --ignore-not-found || true
kubectl delete ns nginx-gateway --ignore-not-found=true || true

kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml
kubectl apply -f "https://raw.githubusercontent.com/nginxinc/nginx-gateway-fabric/${VERSION}/deploy/crds.yaml"
kubectl apply -f "https://raw.githubusercontent.com/nginxinc/nginx-gateway-fabric/${VERSION}/deploy/default/deploy.yaml"

kubectl -n nginx-gateway rollout status deployment/nginx-gateway --timeout=240s

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /tmp/perf-tls.key \
  -out /tmp/perf-tls.crt \
  -subj "/CN=perf.example.com"

kubectl delete secret perf-tls -n default --ignore-not-found
kubectl create secret tls perf-tls \
  --cert=/tmp/perf-tls.crt \
  --key=/tmp/perf-tls.key \
  -n default