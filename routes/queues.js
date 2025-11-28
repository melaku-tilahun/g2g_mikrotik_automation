// routes/queues.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { write } = require('../mikrotik');

router.get('/', async (req, res) => {
    try {
        const rows = await write('/queue/simple/print');
        const config = require('../config/default');
        
        // Get statuses and thresholds from DB
        const dbData = Object.fromEntries(
            db.prepare('SELECT name, status, threshold_kb FROM statuses').all()
                .map(r => [r.name, { status: r.status, threshold: r.threshold_kb }])
        );

        const queues = rows
            .filter(q => q.name?.startsWith('GPON'))
            .map(q => {
                const rate = q.rate || '0/0';
                const [rx, tx] = rate.split('/').map(n => parseInt(n) || 0);
                const dbInfo = dbData[q.name] || { status: 'Inactive', threshold: null };
                
                return {
                    name: q.name,
                    ip: q.target || 'N/A',
                    rx: rx,
                    tx: tx,
                    status: dbInfo.status,
                    threshold: dbInfo.threshold !== null ? dbInfo.threshold : config.alertConfig.defaultThreshold
                };
            });

        res.json({ status: 'ok', queues });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;