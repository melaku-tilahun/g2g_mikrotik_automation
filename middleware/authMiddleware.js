// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const config = require('../config/default');

/**
 * Authentication middleware to protect routes
 * Verifies JWT token from cookies or Authorization header
 */
const authMiddleware = (req, res, next) => {
    try {
        // Get token from cookie or Authorization header
        let token = req.cookies?.token;
        
        if (!token && req.headers.authorization) {
            const authHeader = req.headers.authorization;
            if (authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }
        }

        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Verify token
        const decoded = jwt.verify(token, config.jwt.secret);
        
        // Attach user info to request
        req.user = {
            id: decoded.id,
            username: decoded.username,
            email: decoded.email,
            role: decoded.role || 'viewer' // Default to viewer if not present
        };

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired, please login again' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        return res.status(500).json({ error: 'Authentication error' });
    }
};

const roleHierarchy = {
    'viewer': 0,
    'admin': 1,
    'super_admin': 2
};

/**
 * Middleware to restrict access to specific roles
 * Uses a hierarchy where super_admin > admin > viewer
 * @param {string} role - Required role (e.g., 'admin')
 */
const requireRole = (requiredRole) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const userRoleLevel = roleHierarchy[req.user.role] || 0;
        const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

        if (userRoleLevel < requiredRoleLevel) {
            return res.status(403).json({ error: 'Access denied: Insufficient permissions' });
        }
        
        next();
    };
};

module.exports = { authMiddleware, requireRole };
