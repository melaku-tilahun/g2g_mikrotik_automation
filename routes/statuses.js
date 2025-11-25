// routes/statuses.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { validateStatusUpdate } = require('../middleware/validator');

router.get('/', (req, res) => {
    try {
        const rows = db.prepare('SELECT name, status FROM statuses').all();
        const obj = {};
        rows.forEach(r => obj[r.name] = { status: r.status });
        res.json({ status: 'ok', statuses: obj });
    } catch (err) {
        logger.error('Failed to get statuses', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});

// Bulk update with validation - only handles status, threshold is hardcoded in config
router.post('/bulk', validateStatusUpdate, (req, res) => {
    const updates = req.body;
    
    if (typeof updates !== 'object' || updates === null) {
        return res.status(400).json({ error: 'Invalid request body' });
    }

    const stmt = db.prepare(`
        INSERT INTO statuses (name, status, updated_at)
        VALUES (?, ?, unixepoch())
        ON CONFLICT(name) DO UPDATE SET
            status = excluded.status,
            updated_at = excluded.updated_at
    `);

    const auditStmt = db.prepare(`
        INSERT INTO config_changes (name, field, old_value, new_value, changed_by)
        VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
        for (const [name, data] of Object.entries(updates)) {
            const status = data.status || 'Inactive';

            // Get old value for audit
            const old = db.prepare('SELECT status FROM statuses WHERE name = ?').get(name);
            
            // Update status
            stmt.run(name, status);

            // Log changes
            if (old && old.status !== status) {
                auditStmt.run(name, 'status', old.status, status, req.ip || 'system');
            }

            logger.info('Status updated', { name, status, ip: req.ip });
        }
    });

    try {
        transaction();
        res.json({ status: 'ok', updated: Object.keys(updates).length });
    } catch (err) {
        logger.error('Failed to update statuses', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;