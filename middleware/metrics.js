// middleware/metrics.js
const promClient = require('prom-client');

/**
 * Prometheus metrics collection middleware
 */

// Create a Registry
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5]
});

const httpRequestTotal = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
});

const activeGponCount = new promClient.Gauge({
    name: 'gpon_active_count',
    help: 'Number of active GPON queues'
});

const alertsTotal = new promClient.Counter({
    name: 'alerts_total',
    help: 'Total number of alerts sent',
    labelNames: ['type', 'channel']
});

const mikrotikApiDuration = new promClient.Histogram({
    name: 'mikrotik_api_duration_seconds',
    help: 'Duration of MikroTik API calls',
    buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const mikrotikApiErrors = new promClient.Counter({
    name: 'mikrotik_api_errors_total',
    help: 'Total number of MikroTik API errors',
    labelNames: ['error_type']
});

// Register metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(activeGponCount);
register.registerMetric(alertsTotal);
register.registerMetric(mikrotikApiDuration);
register.registerMetric(mikrotikApiErrors);

/**
 * Middleware to track HTTP request metrics
 */
const metricsMiddleware = (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = req.route ? req.route.path : req.path;

        httpRequestDuration.labels(req.method, route, res.statusCode).observe(duration);
        httpRequestTotal.labels(req.method, route, res.statusCode).inc();
    });

    next();
};

module.exports = {
    register,
    metricsMiddleware,
    metrics: {
        httpRequestDuration,
        httpRequestTotal,
        activeGponCount,
        alertsTotal,
        mikrotikApiDuration,
        mikrotikApiErrors
    }
};
