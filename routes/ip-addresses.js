// routes/ip-addresses.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { write } = require('../mikrotik');
const logger = require('../utils/logger');
const { requireRole } = require('../middleware/authMiddleware');

/**
 * Validate IP address format (supports CIDR notation)
 */
function validateIpAddress(address) {
    if (!address || typeof address !== 'string') {
        return { valid: false, error: 'IP address is required' };
    }

    const cidrPattern = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!cidrPattern.test(address)) {
        return { valid: false, error: 'Invalid IP address format. Use format: 192.168.1.1/24' };
    }

    const parts = address.split('/')[0].split('.');
    for (let part of parts) {
        const num = parseInt(part);
        if (num < 0 || num > 255) {
            return { valid: false, error: 'IP address octets must be between 0 and 255' };
        }
    }

    if (address.includes('/')) {
        const cidr = parseInt(address.split('/')[1]);
        if (cidr < 0 || cidr > 32) {
            return { valid: false, error: 'CIDR prefix must be between 0 and 32' };
        }
    } else {
        return { valid: false, error: 'IP address must include CIDR notation (e.g., /24)' };
    }

    return { valid: true };
}

/**
 * GET /api/ip-addresses
 * Returns all IP addresses from MikroTik (with pagination)
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search || '';
        
        // Fetch all IP addresses from MikroTik
        const ips = await write('/ip/address/print');
        
        // Format response
        let formattedIps = ips.map(ip => {
            return {
                id: ip['.id'],
                address: ip.address,
                network: ip.network,
                interface: ip.interface,
                actualInterface: ip['actual-interface'],
                disabled: ip.disabled === 'true',
                comment: ip.comment || '',
                dynamic: ip.dynamic === 'true',
                invalid: ip.invalid === 'true'
            };
        });

        // Apply search filter if provided
        if (search) {
            const searchLower = search.toLowerCase();
            formattedIps = formattedIps.filter(ip => 
                ip.address?.toLowerCase().includes(searchLower) ||
                ip.interface?.toLowerCase().includes(searchLower) ||
                ip.comment?.toLowerCase().includes(searchLower)
            );
        }

        // Calculate pagination
        const total = formattedIps.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedIps = formattedIps.slice(startIndex, endIndex);

        res.json({ 
            ips: paginatedIps,
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
        logger.error('Failed to fetch IP addresses', { error: err.message });
        res.status(500).json({ error: 'Failed to fetch IP addresses' });
    }
});

/**
 * GET /api/ip-addresses/interfaces
 * Returns available interfaces for IP address assignment
 */
router.get('/interfaces', async (req, res) => {
    try {
        const interfaces = await write('/interface/print');
        
        const formattedInterfaces = interfaces
            .filter(iface => iface.running === 'true' || !iface.disabled)
            .map(iface => ({
                name: iface.name,
                type: iface.type,
                running: iface.running === 'true',
                disabled: iface.disabled === 'true'
            }));

        res.json({ interfaces: formattedInterfaces });
    } catch (err) {
        logger.error('Failed to fetch interfaces', { error: err.message });
        res.status(500).json({ error: 'Failed to fetch interfaces' });
    }
});

/**
 * GET /api/ip-addresses/:id
 * Returns a single IP address by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const ipId = req.params.id;
        
        // Fetch all IPs and find the specific one
        const ips = await write('/ip/address/print', [`?.id=${ipId}`]);
        
        if (!ips || ips.length === 0) {
            return res.status(404).json({ error: 'IP address not found' });
        }

        const ip = ips[0];
        res.json({
            id: ip['.id'],
            address: ip.address,
            network: ip.network,
            interface: ip.interface,
            actualInterface: ip['actual-interface'],
            disabled: ip.disabled === 'true',
            comment: ip.comment || '',
            dynamic: ip.dynamic === 'true',
            invalid: ip.invalid === 'true'
        });
    } catch (err) {
        logger.error('Failed to fetch IP address', { id: req.params.id, error: err.message });
        res.status(500).json({ error: 'Failed to fetch IP address' });
    }
});

/**
 * POST /api/ip-addresses
 * Add a new IP address (admin/super_admin only)
 */
router.post('/', requireRole(['admin', 'super_admin']), async (req, res) => {
    try {
        const { address, interface: iface, comment, disabled } = req.body;

        // Validate IP address
        const validation = validateIpAddress(address);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        // Validate interface
        if (!iface || typeof iface !== 'string') {
            return res.status(400).json({ error: 'Interface is required' });
        }

        // Check if interface exists
        const interfaces = await write('/interface/print', [`?name=${iface}`]);
        if (!interfaces || interfaces.length === 0) {
            return res.status(400).json({ error: `Interface "${iface}" does not exist` });
        }

        // Check for duplicate IP on same interface
        const existingIps = await write('/ip/address/print', [
            `?address=${address}`,
            `?interface=${iface}`
        ]);
        if (existingIps && existingIps.length > 0) {
            return res.status(409).json({ error: 'IP address already exists on this interface' });
        }

        // Add IP address to MikroTik
        const params = [
            `=address=${address}`,
            `=interface=${iface}`
        ];

        if (comment) {
            params.push(`=comment=${comment}`);
        }

        if (disabled) {
            params.push('=disabled=yes');
        }

        await write('/ip/address/add', params);

        // Log to audit
        db.prepare(`
            INSERT INTO audit_logs (user_id, username, action, details, ip_address)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            req.user.id,
            req.user.username,
            'IP_ADD',
            JSON.stringify({ address, interface: iface, comment, disabled }),
            req.ip
        );

        logger.info('IP address added', { 
            address, 
            interface: iface, 
            user: req.user.username 
        });

        res.status(201).json({ 
            message: 'IP address added successfully',
            address,
            interface: iface
        });
    } catch (err) {
        logger.error('Failed to add IP address', { error: err.message, user: req.user?.username });
        res.status(500).json({ error: err.message || 'Failed to add IP address' });
    }
});

/**
 * PATCH /api/ip-addresses/:id
 * Update an existing IP address (admin/super_admin only)
 */
router.patch('/:id', requireRole(['admin', 'super_admin']), async (req, res) => {
    try {
        const ipId = req.params.id;
        const { comment, disabled } = req.body;

        // Check if IP exists
        const ips = await write('/ip/address/print', [`?.id=${ipId}`]);
        if (!ips || ips.length === 0) {
            return res.status(404).json({ error: 'IP address not found' });
        }

        const existingIp = ips[0];

        // Prevent modification of dynamic IPs
        if (existingIp.dynamic === 'true') {
            return res.status(403).json({ error: 'Cannot modify dynamic IP addresses' });
        }

        // Build update parameters
        const params = [`=numbers=${ipId}`];
        const changes = {};

        if (comment !== undefined) {
            params.push(`=comment=${comment}`);
            changes.comment = comment;
        }

        if (disabled !== undefined) {
            params.push(`=disabled=${disabled ? 'yes' : 'no'}`);
            changes.disabled = disabled;
        }

        if (params.length === 1) {
            return res.status(400).json({ error: 'No update parameters provided' });
        }

        // Update IP address in MikroTik
        await write('/ip/address/set', params);

        // Log to audit
        db.prepare(`
            INSERT INTO audit_logs (user_id, username, action, details, ip_address)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            req.user.id,
            req.user.username,
            'IP_UPDATE',
            JSON.stringify({ 
                id: ipId, 
                address: existingIp.address, 
                changes 
            }),
            req.ip
        );

        logger.info('IP address updated', { 
            id: ipId, 
            address: existingIp.address,
            changes,
            user: req.user.username 
        });

        res.json({ 
            message: 'IP address updated successfully',
            changes
        });
    } catch (err) {
        logger.error('Failed to update IP address', { 
            id: req.params.id, 
            error: err.message, 
            user: req.user?.username 
        });
        res.status(500).json({ error: err.message || 'Failed to update IP address' });
    }
});

/**
 * DELETE /api/ip-addresses/:id
 * Delete an IP address (super_admin only)
 */
router.delete('/:id', requireRole(['super_admin']), async (req, res) => {
    try {
        const ipId = req.params.id;

        // Check if IP exists
        const ips = await write('/ip/address/print', [`?.id=${ipId}`]);
        if (!ips || ips.length === 0) {
            return res.status(404).json({ error: 'IP address not found' });
        }

        const existingIp = ips[0];

        // Prevent deletion of dynamic IPs
        if (existingIp.dynamic === 'true') {
            return res.status(403).json({ error: 'Cannot delete dynamic IP addresses' });
        }

        // Delete IP address from MikroTik
        await write('/ip/address/remove', [`=numbers=${ipId}`]);

        // Log to audit
        db.prepare(`
            INSERT INTO audit_logs (user_id, username, action, details, ip_address)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            req.user.id,
            req.user.username,
            'IP_DELETE',
            JSON.stringify({ 
                id: ipId, 
                address: existingIp.address,
                interface: existingIp.interface
            }),
            req.ip
        );

        logger.info('IP address deleted', { 
            id: ipId, 
            address: existingIp.address,
            user: req.user.username 
        });

        res.json({ 
            message: 'IP address deleted successfully',
            address: existingIp.address
        });
    } catch (err) {
        logger.error('Failed to delete IP address', { 
            id: req.params.id, 
            error: err.message, 
            user: req.user?.username 
        });
        res.status(500).json({ error: err.message || 'Failed to delete IP address' });
    }
});

module.exports = router;
