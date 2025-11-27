// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config/default');
const logger = require('../utils/logger');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * POST /api/auth/signup
 * Public signup is DISABLED - only admins can create users
 */
router.post('/signup', (req, res) => {
    return res.status(403).json({ 
        error: 'Public registration is disabled. Please contact your administrator to create an account.' 
    });
});

/**
 * POST /api/auth/login
 * Authenticate user and issue JWT token
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Find user by username or email
        const user = db.prepare(`
            SELECT id, username, email, password_hash, full_name, role, is_active
            FROM profiles
            WHERE username = ? OR email = ?
        `).get(username, username);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.is_active) {
            return res.status(403).json({ error: 'Account is disabled' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        db.prepare('UPDATE profiles SET last_login = unixepoch() WHERE id = ?').run(user.id);

        // Generate JWT token
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            },
            config.jwt.secret,
            { expiresIn: config.jwt.expiresIn }
        );

        // Set HTTP-only cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: config.server.env === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        logger.info(`User logged in: ${user.username} (${user.role})`);

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role
            },
            token
        });
    } catch (error) {
        logger.error('Login error', { error: error.message });
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * POST /api/auth/logout
 * Clear authentication token
 */
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me
 * Get current user profile (protected route)
 */
router.get('/me', authMiddleware, (req, res) => {
    try {
        const user = db.prepare(`
            SELECT id, username, email, first_name, last_name, full_name, role, created_at, last_login
            FROM profiles
            WHERE id = ?
        `).get(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        logger.error('Get user error', { error: error.message });
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

/**
 * PUT /api/auth/profile
 * Update user profile (protected route)
 */
router.put('/profile', authMiddleware, (req, res) => {
    try {
        const { first_name, last_name, email } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!first_name && !last_name && !email) {
            return res.status(400).json({ error: 'At least one field is required' });
        }

        // Check if email is already taken by another user
        if (email) {
            const existingUser = db.prepare('SELECT id FROM profiles WHERE email = ? AND id != ?').get(email, userId);
            if (existingUser) {
                return res.status(400).json({ error: 'Email already in use' });
            }
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (first_name !== undefined) {
            updates.push('first_name = ?');
            values.push(first_name);
        }
        if (last_name !== undefined) {
            updates.push('last_name = ?');
            values.push(last_name);
        }
        if (email) {
            updates.push('email = ?');
            values.push(email);
        }

        values.push(userId);

        db.prepare(`
            UPDATE profiles 
            SET ${updates.join(', ')}
            WHERE id = ?
        `).run(...values);

        // Get updated user
        const updatedUser = db.prepare(`
            SELECT id, username, email, first_name, last_name, full_name, role, created_at, last_login
            FROM profiles
            WHERE id = ?
        `).get(userId);

        logger.info('Profile updated', { userId, updates: Object.keys(req.body) });
        res.json({ message: 'Profile updated successfully', user: updatedUser });
    } catch (error) {
        logger.error('Profile update error', { error: error.message });
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

module.exports = router;
