// server.js
const config = require('./config/default');
const logger = require('./utils/logger');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const basicAuth = require('express-basic-auth');
const { metricsMiddleware } = require('./middleware/metrics');

const trafficRouter = require('./routes/traffic');
const queuesRouter = require('./routes/queues');
const statusesRouter = require('./routes/statuses');
const healthRouter = require('./routes/health');
const metricsRouter = require('./routes/metrics');

require('./monitor'); // Start monitoring

const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            connectSrc: ["'self'", '*'],
            imgSrc: ["'self'", 'data:']
        }
    }
}));

// CORS configuration
const corsOptions = {
    origin: config.server.allowedOrigin === '*' 
        ? '*' 
        : config.server.allowedOrigin.split(','),
    credentials: true
};
app.use(cors(corsOptions));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '1mb' }));

// Static files
app.use(express.static('public'));

// Metrics collection
app.use(metricsMiddleware);

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, { 
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
    next();
});

// Rate limiting - different limits for different endpoints
const apiLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

const statusLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 50,
    message: { error: 'Too many status updates, please slow down' }
});

// Apply rate limiting
app.use('/api', apiLimiter);
app.use('/api/statuses', statusLimiter);

// Optional Basic Auth for admin endpoints
if (config.auth.enabled) {
    app.use('/api/statuses', basicAuth({
        users: { [config.auth.user]: config.auth.pass },
        challenge: true,
        realm: 'GPON Monitor Admin'
    }));
    logger.info('Basic authentication enabled for /api/statuses');
}

// Routes
app.use('/api/queues', queuesRouter);
app.use('/api/statuses', statusesRouter);
app.use('/api/traffic', trafficRouter);
app.use('/health', healthRouter);
app.use('/metrics', metricsRouter);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
    logger.error('Unhandled error', { 
        error: err.message, 
        stack: err.stack,
        path: req.path 
    });
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const server = app.listen(config.server.port, () => {
    logger.info(`GPON Monitor running on http://localhost:${config.server.port}`);
    logger.info(`Environment: ${config.server.env}`);
    logger.info(`Email alerts: ${config.email.user ? 'enabled' : 'disabled'}`);
    logger.info(`Telegram alerts: ${config.telegram.enabled ? 'enabled' : 'disabled'}`);
});

// Graceful shutdown
const gracefulShutdown = signal => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));