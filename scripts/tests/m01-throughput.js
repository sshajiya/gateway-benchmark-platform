name: Gateway Benchmark Platform

on:
  workflow_dispatch:
    inputs:
      gateway:
        description: "envoy | ngf | cilium"
        required: true
        default: "envoy"
      version:
        description: "gateway version"
        required: true
        default: "v1.7.1"
      destroy:
        description: "Destroy existing gateway? (true/false)"
        required: true
        default: "false"
      deploy:
        description: "Deploy gateway? (true/false)"
        required: true
        default: "true"

jobs:
  deploy-validate:
    runs-on: ubuntu-latest
    outputs:
      node_ip: ${{ steps.export.outputs.node_ip }}
      http_port: ${{ steps.export.outputs.http_port }}
      https_port: ${{ steps.export.outputs.https_port }}
      host_header: ${{ steps.export.outputs.host_header }}

    steps:
      - uses: actions/checkout@v4

      - name: Copy scripts to master
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.MASTER_IP }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          source: "scripts"
          target: "/tmp/gateway-benchmark"

      - name: Deploy / Validate
        id: run
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.MASTER_IP }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          script_stop: false
          script: |
            set +e

            GATEWAY="${{ github.event.inputs.gateway }}"
            VERSION="${{ github.event.inputs.version }}"
            DESTROY="${{ github.event.inputs.destroy }}"
            DEPLOY="${{ github.event.inputs.deploy }}"

            BASE="/tmp/gateway-benchmark/scripts/deploy/${GATEWAY}"
            COMMON="/tmp/gateway-benchmark/scripts/deploy/common"

            chmod +x "${COMMON}/cleanup_gateway.sh"
            chmod +x "${BASE}/install.sh"
            . "${BASE}/metadata.env"

            echo "=== INPUTS ==="
            echo "$GATEWAY $VERSION $DESTROY $DEPLOY"

            # 🔥 DESTROY LOGIC
            if [ "$DESTROY" = "true" ]; then
              echo "=== Destroying existing resources ==="
              kubectl delete gateway --all -A --ignore-not-found || true
              kubectl delete httproute --all -A --ignore-not-found || true
              kubectl delete gatewayclass --all --ignore-not-found || true
              "${COMMON}/cleanup_gateway.sh" "$GATEWAY" || true
            fi

            # 🚀 DEPLOY LOGIC
            if [ "$DEPLOY" = "true" ]; then
              echo "=== Fresh deployment ==="

              # always clean before deploy
              kubectl delete gateway --all -A --ignore-not-found || true
              kubectl delete httproute --all -A --ignore-not-found || true

              "${BASE}/install.sh" "$VERSION"

              kubectl apply -f /tmp/gateway-benchmark/scripts/apps/perf-backend.yaml
              kubectl rollout status deployment/perf-backend -n default --timeout=180s

              kubectl apply -f "${BASE}/gateway.yaml"
            else
              echo "=== Reuse existing deployment ==="
            fi

            # 🔧 NODEPORT FIX (only if service exists)
            if [ "$GATEWAY" = "envoy" ]; then
              SVC=$(kubectl -n envoy-gateway-system get svc \
                -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' \
                | grep '^envoy-default-' | head -n1 || true)

              if [ -n "$SVC" ]; then
                kubectl -n envoy-gateway-system patch svc "$SVC" \
                  -p '{"spec":{"type":"NodePort"}}' || true
              fi
            fi

            # ⏳ WAIT FOR GATEWAY (only if deploying)
            if [ "$DEPLOY" = "true" ]; then
              for i in $(seq 1 15); do
                STATUS=$(kubectl -n "$GATEWAY_NAMESPACE" get gateway "$GATEWAY_NAME" \
                  -o jsonpath='{.status.conditions[?(@.type=="Programmed")].status}' 2>/dev/null || true)
                [ "$STATUS" = "True" ] && break
                sleep 5
              done
            fi

            NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')

            SERVICE_NAME=$(kubectl -n "$SERVICE_NAMESPACE" get svc \
              -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' \
              | grep -E "$SERVICE_NAME_REGEX" | head -n1 || true)

            if [ -z "$SERVICE_NAME" ]; then
              echo "NO_SERVICE=true" > /tmp/output.env
              exit 0
            fi

            HTTP_PORT=$(kubectl -n "$SERVICE_NAMESPACE" get svc "$SERVICE_NAME" \
              -o jsonpath='{.spec.ports[?(@.port==80)].nodePort}')

            HTTPS_PORT=$(kubectl -n "$SERVICE_NAMESPACE" get svc "$SERVICE_NAME" \
              -o jsonpath='{.spec.ports[?(@.port==443)].nodePort}')

            echo "=== CURL TEST ==="

            curl -vk --max-time 10 -H "Host: $HOST_HEADER" \
              "http://$NODE_IP:$HTTP_PORT/" || echo "HTTP_FAILED"

            curl -vk --max-time 10 \
              --resolve "$HOST_HEADER:$HTTPS_PORT:$NODE_IP" \
              "https://$HOST_HEADER:$HTTPS_PORT/" || echo "HTTPS_FAILED"

            cat > /tmp/output.env <<EOF
            NODE_IP=$NODE_IP
            HTTP_PORT=$HTTP_PORT
            HTTPS_PORT=$HTTPS_PORT
            HOST_HEADER=$HOST_HEADER
            EOF

      - name: Fetch outputs
        id: export
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.MASTER_IP }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cat /tmp/output.env || echo "NO_SERVICE=true"

  benchmark:
    needs: deploy-validate
    if: ${{ !(github.event.inputs.destroy == 'true' && github.event.inputs.deploy == 'false') }}
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Copy tests to TG
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.TG_IP }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          source: "scripts/tests"
          target: "/tmp/gateway-benchmark"

      - name: Run k6 tests
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.TG_IP }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            mkdir -p /tmp/k6-results
            cd /tmp/gateway-benchmark/scripts/tests

            k6 run m01-throughput-v02.js --summary-export=/tmp/k6-results/m01.json || true
            k6 run m04-tls-handshake.js --summary-export=/tmp/k6-results/m04.json || true

      - name: Download results
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.TG_IP }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          source: "/tmp/k6-results/*"
          target: "./results"

      - name: Generate webpage
        run: |
          mkdir -p public
          echo "<html><body><h1>Gateway Benchmark</h1><pre>" > public/index.html
          cat results/tmp/k6-results/m01.json >> public/index.html || true
          cat results/tmp/k6-results/m04.json >> public/index.html || true
          echo "</pre></body></html>" >> public/index.html

      - name: Publish report
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public