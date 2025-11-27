// routes/admin.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { requireRole } = require('../middleware/authMiddleware');

// Middleware: All routes require admin role
router.use(requireRole('admin'));

/**
 * GET /api/admin/users
 * List all users
 */
router.get('/users', (req, res) => {
    try {
        const users = db.prepare(`
            SELECT id, username, email, first_name, last_name, role, is_active, created_at, last_login
            FROM profiles
            ORDER BY created_at DESC
        `).all();
        res.json({ users });
    } catch (err) {
        logger.error('Failed to get users', { error: err.message });
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/**
 * POST /api/admin/users/:id/role
 * Change user role
 */
router.post('/users/:id/role', (req, res) => {
    const { role } = req.body;
    const userId = req.params.id;

    if (!['admin', 'user', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }

    try {
        // Prevent changing own role to non-admin (to avoid lockout)
        if (parseInt(userId) === req.user.id && role !== 'admin') {
            return res.status(400).json({ error: 'Cannot remove your own admin privileges' });
        }

        db.prepare('UPDATE profiles SET role = ? WHERE id = ?').run(role, userId);
        
        // Log audit
        db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)')
          .run(req.user.id, 'UPDATE_ROLE', `Changed user ${userId} role to ${role}`, req.ip);

        res.json({ message: 'Role updated successfully' });
    } catch (err) {
        logger.error('Failed to update role', { error: err.message });
        res.status(500).json({ error: 'Failed to update role' });
    }
});

/**
 * POST /api/admin/users/:id/toggle
 * Toggle active status
 */
router.post('/users/:id/toggle', (req, res) => {
    const userId = req.params.id;

    try {
        // Prevent deactivating self
        if (parseInt(userId) === req.user.id) {
            return res.status(400).json({ error: 'Cannot deactivate your own account' });
        }

        const user = db.prepare('SELECT is_active FROM profiles WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const newStatus = user.is_active ? 0 : 1;
        db.prepare('UPDATE profiles SET is_active = ? WHERE id = ?').run(newStatus, userId);

        // Log audit
        db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)')
          .run(req.user.id, 'TOGGLE_USER', `Changed user ${userId} active status to ${newStatus}`, req.ip);

        res.json({ message: 'User status updated', is_active: !!newStatus });
    } catch (err) {
        logger.error('Failed to toggle user', { error: err.message });
        res.status(500).json({ error: 'Failed to update user status' });
    }
});

/**
 * GET /api/admin/audit-logs
 * Get recent audit logs
 */
router.get('/audit-logs', (req, res) => {
    try {
        const logs = db.prepare(`
            SELECT a.id, a.action, a.details, a.ip_address, a.timestamp, p.username
            FROM audit_logs a
            LEFT JOIN profiles p ON a.user_id = p.id
            ORDER BY a.timestamp DESC
            LIMIT 100
        `).all();
        res.json({ logs });
    } catch (err) {
        logger.error('Failed to get audit logs', { error: err.message });
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
});

/**
 * POST /api/admin/users
 * Create a new user (admin only)
 */
router.post('/users', async (req, res) => {
    try {
        const { username, email, password, first_name, last_name, role } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        if (role && !['admin', 'user', 'viewer'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        // Check if username or email already exists
        const existingUser = db.prepare('SELECT id FROM profiles WHERE username = ? OR email = ?').get(username, email);
        if (existingUser) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        // Hash password
        const bcrypt = require('bcryptjs');
        const password_hash = await bcrypt.hash(password, 10);

        // Insert user
        const result = db.prepare(`
            INSERT INTO profiles (username, email, password_hash, first_name, last_name, role)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(username, email, password_hash, first_name || null, last_name || null, role || 'viewer');

        // Log audit
        db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)')
          .run(req.user.id, 'CREATE_USER', `Created user: ${username}`, req.ip);

        logger.info(`Admin ${req.user.username} created user: ${username}`);

        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: result.lastInsertRowid,
                username,
                email,
                first_name,
                last_name,
                role: role || 'viewer'
            }
        });
    } catch (error) {
        logger.error('Create user error', { error: error.message });
        res.status(500).json({ error: 'Failed to create user' });
    }
});

/**
 * PUT /api/admin/users/:id
 * Update user profile (admin only)
 */
router.put('/users/:id', (req, res) => {
    try {
        const userId = req.params.id;
        const { username, email, first_name, last_name } = req.body;

        if (!username && !email && !first_name && !last_name) {
            return res.status(400).json({ error: 'At least one field is required' });
        }

        // Check if email is already taken by another user
        if (email) {
            const existingUser = db.prepare('SELECT id FROM profiles WHERE email = ? AND id != ?').get(email, userId);
            if (existingUser) {
                return res.status(400).json({ error: 'Email already in use' });
            }
        }

        // Check if username is already taken by another user
        if (username) {
            const existingUser = db.prepare('SELECT id FROM profiles WHERE username = ? AND id != ?').get(username, userId);
            if (existingUser) {
                return res.status(400).json({ error: 'Username already in use' });
            }
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (username) {
            updates.push('username = ?');
            values.push(username);
        }
        if (email) {
            updates.push('email = ?');
            values.push(email);
        }
        if (first_name !== undefined) {
            updates.push('first_name = ?');
            values.push(first_name);
        }
        if (last_name !== undefined) {
            updates.push('last_name = ?');
            values.push(last_name);
        }

        values.push(userId);

        db.prepare(`UPDATE profiles SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        // Log audit
        db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)')
          .run(req.user.id, 'UPDATE_USER', `Updated user ${userId}`, req.ip);

        logger.info(`Admin ${req.user.username} updated user ${userId}`);
        res.json({ message: 'User updated successfully' });
    } catch (error) {
        logger.error('Update user error', { error: error.message });
        res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * DELETE /api/admin/users/:id
 * Delete user (admin only)
 */
router.delete('/users/:id', (req, res) => {
    try {
        const userId = req.params.id;

        // Prevent deleting self
        if (parseInt(userId) === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        // Check if user exists
        const user = db.prepare('SELECT username FROM profiles WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Delete user
        db.prepare('DELETE FROM profiles WHERE id = ?').run(userId);

        // Log audit
        db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)')
          .run(req.user.id, 'DELETE_USER', `Deleted user: ${user.username} (ID: ${userId})`, req.ip);

        logger.info(`Admin ${req.user.username} deleted user: ${user.username}`);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        logger.error('Delete user error', { error: error.message });
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

/**
 * POST /api/admin/users/:id/password
 * Reset user password (admin only)
 */
router.post('/users/:id/password', async (req, res) => {
    try {
        const userId = req.params.id;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if user exists
        const user = db.prepare('SELECT username FROM profiles WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Hash new password
        const bcrypt = require('bcryptjs');
        const password_hash = await bcrypt.hash(password, 10);

        // Update password
        db.prepare('UPDATE profiles SET password_hash = ? WHERE id = ?').run(password_hash, userId);

        // Log audit
        db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)')
          .run(req.user.id, 'RESET_PASSWORD', `Reset password for user: ${user.username} (ID: ${userId})`, req.ip);

        logger.info(`Admin ${req.user.username} reset password for user: ${user.username}`);
        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        logger.error('Reset password error', { error: error.message });
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

module.exports = router;
