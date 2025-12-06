// services/TwoFactorService.js
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const logger = require('../utils/logger');
const notificationService = require('./NotificationService');

/**
 * Two-Factor Authentication Service
 * Handles OTP generation, verification, and account security
 */
class TwoFactorService {
    constructor() {
        // Configuration
        this.OTP_LENGTH = 6;
        this.OTP_VALIDITY_MS = 10 * 60 * 1000; // 10 minutes
        this.MAX_ATTEMPTS = 5;
        this.LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
        this.RESEND_LIMIT = 3;
        this.RESEND_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
    }

    /**
     * Generate a 6-digit OTP code
     * @returns {string} 6-digit numeric code
     */
    generateOTP() {
        // Generate cryptographically secure random 6-digit number
        const buffer = crypto.randomBytes(3);
        const num = buffer.readUIntBE(0, 3);
        const otp = String(num % 1000000).padStart(this.OTP_LENGTH, '0');
        return otp;
    }

    /**
     * Check if a user requires 2FA based on their role
     * @param {string} role - User role
     * @returns {boolean}
     */
    shouldRequire2FA(role) {
        return role === 'admin' || role === 'super_admin';
    }

    /**
     * Check if user's 2FA is enabled
     * @param {number} userId - User ID
     * @returns {boolean}
     */
    is2FAEnabled(userId) {
        const user = db.prepare('SELECT twofa_enabled FROM profiles WHERE id = ?').get(userId);
        return user && user.twofa_enabled === 1;
    }

    /**
     * Check if account is currently locked due to failed attempts
     * @param {number} userId - User ID
     * @returns {Object} { locked: boolean, remainingTime: number }
     */
    isLocked(userId) {
        const user = db.prepare(
            'SELECT twofa_locked_until FROM profiles WHERE id = ?'
        ).get(userId);

        if (!user || !user.twofa_locked_until) {
            return { locked: false, remainingTime: 0 };
        }

        const now = Math.floor(Date.now() / 1000);
        if (user.twofa_locked_until > now) {
            const remainingTime = user.twofa_locked_until - now;
            return { locked: true, remainingTime };
        }

        // Lock has expired, clear it
        db.prepare(
            'UPDATE profiles SET twofa_locked_until = NULL, twofa_attempts = 0 WHERE id = ?'
        ).run(userId);

        return { locked: false, remainingTime: 0 };
    }

    /**
     * Generate and send OTP to user's email
     * @param {number} userId - User ID
     * @param {string} email - User email
     * @param {string} username - Username for personalization
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async sendOTP(userId, email, username) {
        try {
            // Check if account is locked
            const lockStatus = this.isLocked(userId);
            if (lockStatus.locked) {
                const minutes = Math.ceil(lockStatus.remainingTime / 60);
                return {
                    success: false,
                    error: `Account temporarily locked. Try again in ${minutes} minute(s).`
                };
            }

            // Generate OTP
            const otp = this.generateOTP();
            const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(this.OTP_VALIDITY_MS / 1000);

            // Hash OTP before storing (security best practice)
            const hashedOTP = await bcrypt.hash(otp, 10);

            // Store OTP in database
            db.prepare(`
                UPDATE profiles 
                SET twofa_secret = ?, 
                    twofa_secret_expires = ?,
                    twofa_attempts = 0
                WHERE id = ?
            `).run(hashedOTP, expiresAt, userId);

            // Send OTP via email
            await notificationService.sendOTPEmail(email, otp, username);

            logger.info('OTP sent successfully', { userId, email });

            return { success: true };
        } catch (error) {
            logger.error('Failed to send OTP', { userId, error: error.message });
            return {
                success: false,
                error: 'Failed to send verification code. Please try again.'
            };
        }
    }

    /**
     * Verify OTP provided by user
     * @param {number} userId - User ID
     * @param {string} code - OTP code to verify
     * @returns {Promise<{valid: boolean, error?: string, attemptsRemaining?: number}>}
     */
    async verifyOTP(userId, code) {
        try {
            // Check if account is locked
            const lockStatus = this.isLocked(userId);
            if (lockStatus.locked) {
                const minutes = Math.ceil(lockStatus.remainingTime / 60);
                return {
                    valid: false,
                    error: `Account temporarily locked. Try again in ${minutes} minute(s).`
                };
            }

            // Get user's OTP data
            const user = db.prepare(`
                SELECT twofa_secret, twofa_secret_expires, twofa_attempts
                FROM profiles
                WHERE id = ?
            `).get(userId);

            if (!user || !user.twofa_secret) {
                return {
                    valid: false,
                    error: 'No verification code found. Please request a new code.'
                };
            }

            // Check if OTP has expired
            const now = Math.floor(Date.now() / 1000);
            if (user.twofa_secret_expires < now) {
                this.clearOTP(userId);
                return {
                    valid: false,
                    error: 'Verification code expired. Please request a new code.'
                };
            }

            // Verify OTP
            const isValid = await bcrypt.compare(code, user.twofa_secret);

            if (isValid) {
                // Success! Clear OTP and reset attempts
                this.clearOTP(userId);
                logger.info('OTP verified successfully', { userId });
                return { valid: true };
            } else {
                // Increment failed attempts
                const newAttempts = (user.twofa_attempts || 0) + 1;
                const attemptsRemaining = this.MAX_ATTEMPTS - newAttempts;

                if (newAttempts >= this.MAX_ATTEMPTS) {
                    // Lock account
                    const lockUntil = now + Math.floor(this.LOCKOUT_DURATION_MS / 1000);
                    db.prepare(`
                        UPDATE profiles 
                        SET twofa_attempts = ?, twofa_locked_until = ?
                        WHERE id = ?
                    `).run(newAttempts, lockUntil, userId);

                    logger.warn('Account locked due to failed 2FA attempts', { userId });

                    return {
                        valid: false,
                        error: 'Too many failed attempts. Account locked for 30 minutes.',
                        attemptsRemaining: 0
                    };
                } else {
                    // Update attempt count
                    db.prepare('UPDATE profiles SET twofa_attempts = ? WHERE id = ?')
                        .run(newAttempts, userId);

                    logger.warn('Invalid OTP attempt', { userId, attempts: newAttempts });

                    return {
                        valid: false,
                        error: `Invalid verification code. ${attemptsRemaining} attempt(s) remaining.`,
                        attemptsRemaining
                    };
                }
            }
        } catch (error) {
            logger.error('OTP verification error', { userId, error: error.message });
            return {
                valid: false,
                error: 'Verification failed. Please try again.'
            };
        }
    }

    /**
     * Clear OTP after successful verification or expiry
     * @param {number} userId - User ID
     */
    clearOTP(userId) {
        db.prepare(`
            UPDATE profiles 
            SET twofa_secret = NULL, 
                twofa_secret_expires = NULL,
                twofa_attempts = 0
            WHERE id = ?
        `).run(userId);
    }

    /**
     * Toggle 2FA for a user (admin only)
     * @param {number} userId - User ID
     * @param {boolean} enabled - Enable or disable 2FA
     */
    toggle2FA(userId, enabled) {
        db.prepare('UPDATE profiles SET twofa_enabled = ? WHERE id = ?')
            .run(enabled ? 1 : 0, userId);

        if (!enabled) {
            // Clear any existing OTP data
            this.clearOTP(userId);
        }

        logger.info('2FA toggled', { userId, enabled });
    }

    /**
     * Get 2FA status for a user
     * @param {number} userId - User ID
     * @returns {Object}
     */
    get2FAStatus(userId) {
        const user = db.prepare(`
            SELECT twofa_enabled, twofa_locked_until, twofa_attempts
            FROM profiles
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return null;
        }

        const lockStatus = this.isLocked(userId);

        return {
            enabled: user.twofa_enabled === 1,
            locked: lockStatus.locked,
            lockRemainingSeconds: lockStatus.remainingTime,
            failedAttempts: user.twofa_attempts || 0
        };
    }
}

// Singleton instance
const twoFactorService = new TwoFactorService();

module.exports = twoFactorService;
