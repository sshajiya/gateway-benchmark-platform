import http from 'k6/http';
import { check } from 'k6';

// ✅ Dynamic inputs from GitHub workflow / environment
const HOST = __ENV.TARGET_HOST || 'perf.example.com';
const NODE_IP = __ENV.TARGET_NODE_IP;
const PORT = __ENV.TARGET_HTTP_PORT;

// 🔥 Construct URL dynamically
const URL = `http://${NODE_IP}:${PORT}/`;

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
        { duration: '30s', target: 60000 },
        { duration: '30s', target: 70000 },
        { duration: '30s', target: 80000 },
        { duration: '30s', target: 90000 },
        { duration: '30s', target: 100000 },
        { duration: '30s', target: 0 },
      ],
    },
  },

  thresholds: {
    http_req_failed: [{
      threshold: 'rate<0.05',
      abortOnFail: true,
      delayAbortEval: '30s',
    }],

    http_req_duration: [{
      threshold: 'p(99)<5000',
      abortOnFail: true,
      delayAbortEval: '30s',
    }],

    dropped_iterations: [{
      threshold: 'count<5000',
      abortOnFail: true,
      delayAbortEval: '60s',
    }],
  },

  noConnectionReuse: false,
  userAgent: 'k6-gateway-throughput-test',
};

export default function () {
  const res = http.get(URL, {
    headers: {
      Host: HOST,
    },
    timeout: '10s',
    tags: {
      test: 'M01-throughput',
      gateway: __ENV.GATEWAY || 'unknown',
      version: __ENV.VERSION || 'unknown',
    },
  });

  check(res, {
    'status 200': (r) => r.status === 200,
  });
}