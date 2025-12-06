// server.js
const config = require('./config/default');
const logger = require('./utils/logger');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { metricsMiddleware } = require('./middleware/metrics');
const { authMiddleware, requireRole } = require('./middleware/authMiddleware');

const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const adminLimitedRouter = require('./routes/admin-limited');
const trafficRouter = require('./routes/traffic');
const queuesRouter = require('./routes/queues');
const statusesRouter = require('./routes/statuses');
const healthRouter = require('./routes/health');
const metricsRouter = require('./routes/metrics');
const allQueuesRouter = require('./routes/all-queues');
const ipAddressesRouter = require('./routes/ip-addresses');

require('./monitor'); // Start monitoring
const allQueuesMonitor = require('./services/AllQueuesMonitor');
allQueuesMonitor.start();
const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
            connectSrc: ["'self'", '*'],
            imgSrc: ["'self'", 'data:'],
            upgradeInsecureRequests: null
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
app.use(cookieParser());

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/admin', authMiddleware, adminRouter);
app.use('/api/admin-panel', authMiddleware, adminLimitedRouter); 
app.use('/api/queues', authMiddleware, queuesRouter);
app.use('/api/statuses', authMiddleware, statusesRouter);
app.use('/api/traffic', authMiddleware, trafficRouter);
app.use('/api/all-queues', authMiddleware, allQueuesRouter);
app.use('/api/ip-addresses', authMiddleware, ipAddressesRouter);
app.use('/health', healthRouter);
app.use('/metrics', metricsRouter);

// Root Route - Redirect to Login (must be BEFORE static middleware)
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Legacy Redirects
app.get('/login.html', (req, res) => res.redirect('/login'));
app.get('/index.html', (req, res) => res.redirect('/dashboard'));
app.get('/admin.html', (req, res) => res.redirect('/admin'));

// Static Assets
app.use('/assets', express.static('public/assets'));

// Public Views
app.use('/login', express.static('public/login'));

// Protected Views
app.use('/profile', authMiddleware, express.static('public/profile'));
app.use('/dashboard', authMiddleware, express.static('public/dashboard'));
app.use('/all-queues', authMiddleware, express.static('public/all-queues'));
app.use('/ip-addresses', authMiddleware, express.static('public/ip-addresses'));
app.use('/super_admin', authMiddleware, requireRole('super_admin'), express.static('public/super_admin'));
app.use('/admin-panel', authMiddleware, requireRole('admin'), express.static('public/admin-panel'));

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

// Rate limiting
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

app.use('/api', apiLimiter);
app.use('/api/statuses', statusLimiter);

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
});

// Graceful shutdown
const gracefulShutdown = signal => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));