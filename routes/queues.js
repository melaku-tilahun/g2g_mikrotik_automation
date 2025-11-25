// routes/queues.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { write } = require('../mikrotik');

router.get('/', async (req, res) => {
    try {
        const rows = await write('/queue/simple/print');
        const statuses = Object.fromEntries(
            db.prepare('SELECT name, status FROM statuses').all().map(r => [r.name, r.status])
        );

        const queues = rows
            .filter(q => q.name?.startsWith('GPON'))
            .map(q => {
                const rate = q.rate || '0/0';
                const [rx, tx] = rate.split('/').map(n => parseInt(n) || 0);
                return {
                    name: q.name,
                    ip: q.target || 'N/A',
                    rx: rx,
                    tx: tx,
                    status: statuses[q.name] || 'Inactive'
                };
            });

        res.json({ status: 'ok', queues });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;