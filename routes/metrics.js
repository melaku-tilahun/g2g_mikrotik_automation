// routes/metrics.js
const express = require('express');
const router = express.Router();
const { register } = require('../middleware/metrics');

/**
 * Prometheus metrics endpoint
 * Exposes application metrics in Prometheus format
 */
router.get('/', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
