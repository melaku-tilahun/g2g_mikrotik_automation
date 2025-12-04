// routes/admin-limited.js
// Admin panel routes for regular admins (limited user management)
const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const { requireRole } = require('../middleware/authMiddleware');

// Middleware: All routes require admin role
router.use(requireRole('admin'));

/**
 * GET /api/admin-panel/users
 * Get all users (excluding super_admins for security)
 */
router.get('/users', (req, res) => {
    try {
        const users = db.prepare(`
            SELECT id, username, email, first_name, last_name, role, is_active, created_at, last_login
            FROM profiles
            WHERE role != 'super_admin'
            ORDER BY created_at DESC
        `).all();
        res.json({ users });
    } catch (err) {
        logger.error('Failed to get users', { error: err.message });
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/**
 * POST /api/admin-panel/users/:id/role
 * Change user role (admin can only set admin or viewer roles)
 */
router.post('/users/:id/role', (req, res) => {
    const { role } = req.body;
    const userId = req.params.id;

    // Admins can only assign admin or viewer roles
    if (!['admin', 'viewer'].includes(role)) {
        return res.status(403).json({ error: 'You can only assign admin or viewer roles' });
    }

    try {
        // Check if target user is a super_admin
        const targetUser = db.prepare('SELECT role FROM profiles WHERE id = ?').get(userId);
        if (targetUser && targetUser.role === 'super_admin') {
            return res.status(403).json({ error: 'Cannot modify super admin users' });
        }

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
 * POST /api/admin-panel/users
 * Create a new user (admin can only create admin or viewer users)
 */
router.post('/users', async (req, res) => {
    try {
        const { username, email, password, first_name, last_name, role } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Admins can only create admin or viewer users
        if (role && !['admin', 'viewer'].includes(role)) {
            return res.status(403).json({ error: 'You can only create admin or viewer users' });
        }

        // Check if username or email already exists
        const existingUser = db.prepare('SELECT id FROM profiles WHERE username = ? OR email = ?').get(username, email);
        if (existingUser) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, 10);

        // Insert user
        const result = db.prepare(`
            INSERT INTO profiles (username, email, password_hash, first_name, last_name, role)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(username, email, password_hash, first_name || null, last_name || null, role || 'viewer');

        // Log audit
        db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)')
          .run(req.user.id, 'CREATE_USER', `Created user ${username} with role ${role || 'viewer'}`, req.ip);

        res.json({ message: 'User created successfully', userId: result.lastInsertRowid });
    } catch (err) {
        logger.error('Failed to create user', { error: err.message });
        res.status(500).json({ error: 'Failed to create user' });
    }
});

/**
 * PUT /api/admin-panel/users/:id
 * Update user details (cannot update super_admins)
 */
router.put('/users/:id', (req, res) => {
    const userId = req.params.id;
    const { username, email, first_name, last_name, role } = req.body;

    try {
        // Check if target user is a super_admin
        const targetUser = db.prepare('SELECT role FROM profiles WHERE id = ?').get(userId);
        if (targetUser && targetUser.role === 'super_admin') {
            return res.status(403).json({ error: 'Cannot modify super admin users' });
        }

        // Admins can only assign admin or viewer roles
        if (role && !['admin', 'viewer'].includes(role)) {
            return res.status(403).json({ error: 'You can only assign admin or viewer roles' });
        }

        // Check if username or email already exists (excluding current user)
        const existingUser = db.prepare('SELECT id FROM profiles WHERE (username = ? OR email = ?) AND id != ?')
            .get(username, email, userId);
        if (existingUser) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        db.prepare(`
            UPDATE profiles 
            SET username = ?, email = ?, first_name = ?, last_name = ?, role = ?
            WHERE id = ?
        `).run(username, email, first_name || null, last_name || null, role || 'viewer', userId);

        // Log audit
        db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)')
          .run(req.user.id, 'UPDATE_USER', `Updated user ${userId}`, req.ip);

        res.json({ message: 'User updated successfully' });
    } catch (err) {
        logger.error('Failed to update user', { error: err.message });
        res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * POST /api/admin-panel/users/:id/password
 * Reset user password (cannot reset super_admin passwords)
 */
router.post('/users/:id/password', async (req, res) => {
    const userId = req.params.id;
    const { password } = req.body;

    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        // Check if target user is a super_admin
        const targetUser = db.prepare('SELECT role FROM profiles WHERE id = ?').get(userId);
        if (targetUser && targetUser.role === 'super_admin') {
            return res.status(403).json({ error: 'Cannot modify super admin users' });
        }

        const password_hash = await bcrypt.hash(password, 10);
        db.prepare('UPDATE profiles SET password_hash = ? WHERE id = ?').run(password_hash, userId);

        // Log audit
        db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)')
          .run(req.user.id, 'RESET_PASSWORD', `Reset password for user ${userId}`, req.ip);

        res.json({ message: 'Password reset successfully' });
    } catch (err) {
        logger.error('Failed to reset password', { error: err.message });
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

/**
 * POST /api/admin-panel/users/:id/toggle
 * Toggle user active status (cannot toggle super_admins)
 */
router.post('/users/:id/toggle', (req, res) => {
    const userId = req.params.id;

    try {
        // Check if target user is a super_admin
        const targetUser = db.prepare('SELECT role, is_active FROM profiles WHERE id = ?').get(userId);
        if (targetUser && targetUser.role === 'super_admin') {
            return res.status(403).json({ error: 'Cannot modify super admin users' });
        }

        const newStatus = targetUser.is_active ? 0 : 1;
        db.prepare('UPDATE profiles SET is_active = ? WHERE id = ?').run(newStatus, userId);

        // Log audit
        db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)')
          .run(req.user.id, 'TOGGLE_USER', `${newStatus ? 'Enabled' : 'Disabled'} user ${userId}`, req.ip);

        res.json({ message: 'User status updated successfully' });
    } catch (err) {
        logger.error('Failed to toggle user', { error: err.message });
        res.status(500).json({ error: 'Failed to toggle user' });
    }
});

/**
 * DELETE /api/admin-panel/users/:id
 * Delete a user (cannot delete super_admins or self)
 */
router.delete('/users/:id', (req, res) => {
    const userId = req.params.id;

    try {
        // Check if target user is a super_admin
        const targetUser = db.prepare('SELECT role, username FROM profiles WHERE id = ?').get(userId);
        if (targetUser && targetUser.role === 'super_admin') {
            return res.status(403).json({ error: 'Cannot delete super admin users' });
        }

        // Prevent self-deletion
        if (parseInt(userId) === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        db.prepare('DELETE FROM profiles WHERE id = ?').run(userId);

        // Log audit
        db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)')
          .run(req.user.id, 'DELETE_USER', `Deleted user ${targetUser.username} (ID: ${userId})`, req.ip);

        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        logger.error('Failed to delete user', { error: err.message });
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

/**
 * GET /api/admin-panel/audit-logs
 * Get audit logs
 */
router.get('/audit-logs', (req, res) => {
    try {
        const logs = db.prepare(`
            SELECT 
                a.id, a.user_id, a.action, a.details, a.ip_address, a.created_at,
                p.username
            FROM audit_logs a
            LEFT JOIN profiles p ON a.user_id = p.id
            ORDER BY a.created_at DESC
            LIMIT 100
        `).all();
        res.json({ logs });
    } catch (err) {
        logger.error('Failed to get audit logs', { error: err.message });
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
});

module.exports = router;
