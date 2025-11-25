// routes/traffic.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/traffic/GPON-...  → last 24h of data
router.get('/:name', (req, res) => {
    const name = req.params.name;
    const since = Math.floor(Date.now() / 1000) - (24 * 60 * 60); // last 24h

    const rows = db.prepare(`
        SELECT timestamp * 1000 as time, rx, tx
        FROM traffic_log
        WHERE name = ? AND timestamp >= ?
        ORDER BY timestamp ASC
    `).all(name, since);

    // Downsample if too many points (max 200)
    const step = Math.ceil(rows.length / 200);
    const data = rows.filter((_, i) => i % step === 0 || i === rows.length - 1);

    res.json({
        name,
        data: data.map(p => ({
            time: p.time,
            rx: Math.round(p.rx / 1000),    // KB/s
            tx: Math.round(p.tx / 1000),
            total: Math.round((p.rx + p.tx) / 1000)
        }))
    });
});

module.exports = router;