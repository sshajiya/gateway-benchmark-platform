import http from 'k6/http';
import { check } from 'k6';

const TARGET_NODE_IP = __ENV.TARGET_NODE_IP || '127.0.0.1';
const TARGET_HTTP_PORT = __ENV.TARGET_HTTP_PORT || '80';
const TARGET_HOST = __ENV.TARGET_HOST || 'perf.example.com';

const BASE_URL = `http://${TARGET_NODE_IP}:${TARGET_HTTP_PORT}/`;

export const options = {
  scenarios: {
    throughput_gbps: {
      executor: 'ramping-arrival-rate',
      startRate: 10000,
      timeUnit: '1s',
      preAllocatedVUs: 20000,
      maxVUs: 100000,
      stages: [
        { duration: '30s', target: 20000 },
        { duration: '30s', target: 30000 },
        { duration: '30s', target: 40000 },
        { duration: '30s', target: 50000 },
        { duration: '30s', target: 0 },
      ],
    },
  },

  thresholds: {
    http_req_failed: [
      {
        threshold: 'rate<0.05',
        abortOnFail: true,
        delayAbortEval: '30s',
      },
    ],
    http_req_duration: [
      {
        threshold: 'p(99)<5000',
        abortOnFail: true,
        delayAbortEval: '30s',
      },
    ],
    dropped_iterations: [
      {
        threshold: 'count<5000',
        abortOnFail: true,
        delayAbortEval: '60s',
      },
    ],
  },

  noConnectionReuse: false,
  userAgent: 'k6-gateway-throughput-test',
};

export default function () {
  const res = http.get(BASE_URL, {
    headers: {
      Host: TARGET_HOST,
    },
    timeout: '10s',
    tags: {
      test: 'M01-throughput',
      host: TARGET_HOST,
      target: `${TARGET_NODE_IP}:${TARGET_HTTP_PORT}`,
    },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}