// routes/statuses.js
const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    const rows = db.prepare('SELECT name, status, threshold_kb FROM statuses').all();
    const obj = {};
    rows.forEach(r => obj[r.name] = { status: r.status, threshold: r.threshold_kb || 0 });
    res.json({ status: 'ok', statuses: obj });
});

// Bulk update (recommended)
router.post('/bulk', (req, res) => {
    const updates = req.body;
    if (typeof updates !== 'object') return res.status(400).json({ error: 'Invalid' });

    const stmt = db.prepare(`
        INSERT INTO statuses (name, status, threshold_kb, updated_at)
        VALUES (?, ?, ?, unixepoch())
        ON CONFLICT(name) DO UPDATE SET
            status = excluded.status,
            threshold_kb = excluded.threshold_kb,
            updated_at = excluded.updated_at
    `);

    const transaction = db.transaction(() => {
        for (const [name, data] of Object.entries(updates)) {
            const status = data.status || 'Inactive';
            const threshold = parseInt(data.threshold) || 10;
            stmt.run(name, status, threshold);
        }
    });

    try {
        transaction();
        res.json({ status: 'ok' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;