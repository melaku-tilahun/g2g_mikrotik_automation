// routes/health.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { write } = require('../mikrotik');
const logger = require('../utils/logger');

/**
 * Health check endpoints for monitoring and orchestration
 */

/**
 * Basic health check - always returns 200 if server is running
 */
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

/**
 * Readiness probe - checks if app is ready to serve traffic
 * Verifies database and MikroTik connections
 */
router.get('/ready', async (req, res) => {
    const checks = {
        database: false,
        mikrotik: false
    };

    try {
        // Check database
        db.prepare('SELECT 1').get();
        checks.database = true;
    } catch (err) {
        logger.error('Database health check failed', { error: err.message });
    }

    try {
        // Check MikroTik connection (with timeout)
        const timeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
        );
        
        await Promise.race([
            write('/system/identity/print'),
            timeout
        ]);
        checks.mikrotik = true;
    } catch (err) {
        logger.error('MikroTik health check failed', { error: err.message });
    }

    const allHealthy = Object.values(checks).every(v => v === true);
    const statusCode = allHealthy ? 200 : 503;

    res.status(statusCode).json({
        status: allHealthy ? 'ready' : 'not_ready',
        checks,
        timestamp: new Date().toISOString()
    });
});

/**
 * Liveness probe - checks if app is alive (not deadlocked)
 */
router.get('/live', (req, res) => {
    res.json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        uptime: process.uptime()
    });
});

module.exports = router;
