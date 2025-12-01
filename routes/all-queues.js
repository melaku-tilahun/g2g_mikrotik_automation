// routes/all-queues.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { write } = require('../mikrotik');
const logger = require('../utils/logger');

/**
 * GET /api/all-queues
 * Returns all queues with current traffic data (with pagination)
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search || '';
        
        // Fetch all queues from MikroTik
        const queues = await write('/queue/simple/print');
        
        // Format response
        let formattedQueues = queues.map(q => {
            const rx = parseInt(q.rate?.split('/')[0] || 0);
            const tx = parseInt(q.rate?.split('/')[1] || 0);
            
            return {
                name: q.name,
                target: q.target || 'N/A',
                parent: q.parent || null,
                rx: rx,
                tx: tx,
                maxLimit: q['max-limit'] || 'N/A',
                disabled: q.disabled === 'true',
                comment: q.comment || ''
            };
        });

        // Apply search filter if provided
        if (search) {
            formattedQueues = formattedQueues.filter(q => 
                q.name?.toLowerCase().includes(search.toLowerCase()) ||
                q.target?.toLowerCase().includes(search.toLowerCase())
            );
        }

        // Calculate pagination
        const total = formattedQueues.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedQueues = formattedQueues.slice(startIndex, endIndex);

        res.json({ 
            queues: paginatedQueues,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (err) {
        logger.error('Failed to fetch all queues', { error: err.message });
        res.status(500).json({ error: 'Failed to fetch queues' });
    }
});

/**
 * GET /api/all-queues/traffic/:name
 * Returns 24-hour traffic history for a specific queue
 */
router.get('/traffic/:name', (req, res) => {
    const name = req.params.name;
    const since = Math.floor(Date.now() / 1000) - (24 * 60 * 60); // last 24h

    try {
        const rows = db.prepare(`
            SELECT timestamp * 1000 as time, rx, tx
            FROM all_queues_traffic_log
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
    } catch (err) {
        logger.error('Failed to fetch queue traffic history', { name, error: err.message });
        res.status(500).json({ error: 'Failed to fetch traffic history' });
    }
});

/**
 * POST /api/all-queues/toggle
 * Enable or disable a queue in MikroTik
 */
router.post('/toggle', async (req, res) => {
    const { name, enabled } = req.body;

    // Only admins and developers can enable/disable queues
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
        return res.status(403).json({ error: 'Access denied: Admin or Developer role required' });
    }

    if (!name || typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Invalid request: name and enabled (boolean) required' });
    }

    try {
        logger.info(`Attempting to toggle queue: ${name} to ${enabled}`);

        // First, find the queue by name to get its ID
        const queues = await write('/queue/simple/print', [`?name=${name}`]);
        
        logger.info(`Queue search result for "${name}":`, { count: queues ? queues.length : 0 });

        if (!queues || queues.length === 0) {
            logger.warn(`Queue "${name}" not found in MikroTik`);
            return res.status(404).json({ error: `Queue "${name}" not found` });
        }
        
        const queueId = queues[0]['.id'];
        logger.info(`Found queue ID for "${name}": ${queueId}`);
        
        // Execute MikroTik command to enable/disable queue using the ID
        const command = enabled 
            ? `/queue/simple/enable`
            : `/queue/simple/disable`;
        
        logger.info(`Executing command: ${command} with ID: ${queueId}`);
        await write(command, [`=numbers=${queueId}`]);
        logger.info(`Command executed successfully`);

        // Log to audit_logs
        db.prepare(`
            INSERT INTO audit_logs (user_id, username, action, details, ip_address)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            req.user.id,
            req.user.username,
            'queue_toggle',
            JSON.stringify({ 
                queue: name, 
                enabled: enabled,
                previous_state: !enabled 
            }),
            req.ip
        );

        logger.info(`Queue ${enabled ? 'enabled' : 'disabled'}`, { 
            queue: name, 
            user: req.user.username 
        });

        res.json({ 
            success: true, 
            message: `Queue ${enabled ? 'enabled' : 'disabled'} successfully`,
            queue: name,
            enabled: enabled
        });
    } catch (err) {
        logger.error('Failed to toggle queue', { 
            name, 
            enabled, 
            error: err.message,
            stack: err.stack,
            code: err.code
        });
        // Return the specific error message from MikroTik if available
        res.status(500).json({ error: `Failed to toggle queue: ${err.message}` });
    }
});

module.exports = router;
