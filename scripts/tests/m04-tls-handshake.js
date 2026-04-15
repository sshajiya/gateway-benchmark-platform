import http from 'k6/http';
import { check } from 'k6';

// ✅ Dynamic inputs from workflow
const HOST = __ENV.TARGET_HOST || 'perf.example.com';
const NODE_IP = __ENV.TARGET_NODE_IP;
const PORT = __ENV.TARGET_HTTPS_PORT;

// 🔥 Dynamic URL
const URL = `https://${NODE_IP}:${PORT}/`;

export const options = {
  scenarios: {
    tls_handshake_rate: {
      executor: 'ramping-arrival-rate',
      startRate: 1000,
      timeUnit: '1s',
      preAllocatedVUs: 5000,
      maxVUs: 50000,
      stages: [
        { duration: '30s', target: 2000  },
        { duration: '30s', target: 4000  },
        { duration: '30s', target: 0     },
      ],
    },
  },

  // 🔥 Force new TLS handshake every request (correct)
  noConnectionReuse: true,

  // ✅ Needed for self-signed cert (your setup)
  insecureSkipTLSVerify: true,

  thresholds: {
    http_req_failed: [{
      threshold: 'rate<0.05',
      abortOnFail: true,
      delayAbortEval: '20s',
    }],
    http_req_duration: [{
      threshold: 'p(99)<5000',
      abortOnFail: true,
      delayAbortEval: '20s',
    }],
    dropped_iterations: [{
      threshold: 'count<5000',
      abortOnFail: true,
      delayAbortEval: '30s',
    }],
  },
};

export default function () {
  const res = http.get(URL, {
    headers: {
      Host: HOST, // 🔥 critical for SNI + routing
    },
    timeout: '15s',
    tags: {
      test: 'M04-tls-handshake',
      gateway: __ENV.GATEWAY || 'unknown',
      version: __ENV.VERSION || 'unknown',
    },
  });

  check(res, {
    'status 200': (r) => r.status === 200,
  });
}