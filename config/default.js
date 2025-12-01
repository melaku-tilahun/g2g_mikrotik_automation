// config/default.js
require('dotenv').config();

/**
 * Centralized configuration management
 * Validates and provides defaults for all application settings
 */
const config = {
    server: {
        port: parseInt(process.env.PORT) || 3000,
        env: process.env.NODE_ENV || 'development',
        allowedOrigin: process.env.ALLOWED_ORIGIN || '*'
    },

    mikrotik: {
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASS,
        port: parseInt(process.env.MIKROTIK_PORT) || 8728,
        timeout: 20000,
        maxReconnectAttempts: 10
    },

    // ============================================
    // ALERT CONFIGURATION - Easy to modify
    // ============================================
    alertConfig: {
        // Default traffic threshold in KB/s (0.01 = near-complete traffic loss triggers alert)
        defaultThreshold: 0.01,
        
        // Time to wait before sending first alert (in minutes)
        firstAlertDelayMinutes: 10,
        
        // Time to wait before sending second alert (in hours)
        secondAlertDelayHours: 3,

        // Time to wait before sending recovery notification (in minutes)
        // Prevents flapping (repetitive up/down alerts)
        recoveryDelayMinutes: 1,
        
        // Enable recovery notifications when traffic returns to normal
        sendRecoveryNotifications: false,
        
        // ============================================
        // NOTIFICATION CHANNELS - Turn on/off here
        // ============================================
        // Enable/disable email notifications
        enableEmail: true,
        
        // Enable/disable Telegram notifications
        enableTelegram: true
    },

    monitoring: {
        pollInterval: parseInt(process.env.POLL_INTERVAL) || 30000,
        // Calculate alert delays from alertConfig
        get alertDelayMs() {
            return config.alertConfig.firstAlertDelayMinutes * 60 * 1000;
        },
        get secondAlertMs() {
            return config.alertConfig.secondAlertDelayHours * 60 * 60 * 1000;
        },
        get recoveryDelayMs() {
            return config.alertConfig.recoveryDelayMinutes * 60 * 1000;
        },
        get defaultThreshold() {
            return config.alertConfig.defaultThreshold;
        }
    },

    email: {
        service: 'gmail',
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
        to: process.env.EMAIL_TO
    },

    telegram: {
        token: process.env.TELEGRAM_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID,
        enabled: !!(process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_CHAT_ID)
    },

    auth: {
        enabled: !!(process.env.ADMIN_USER && process.env.ADMIN_PASS),
        user: process.env.ADMIN_USER,
        pass: process.env.ADMIN_PASS
    },

    jwt: {
        secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
        expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    },

    database: {
        path: process.env.DB_PATH || './gpon.db',
        backupEnabled: process.env.DB_BACKUP_ENABLED === 'true',
        backupInterval: parseInt(process.env.DB_BACKUP_INTERVAL) || 86400000,
        retentionDays: parseInt(process.env.DATA_RETENTION_DAYS) || 30
    },

    rateLimit: {
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 100
    }
};

/**
 * Validate required configuration
 * @throws {Error} if required config is missing
 */
function validateConfig() {
    const required = [
        { key: 'mikrotik.host', value: config.mikrotik.host },
        { key: 'mikrotik.user', value: config.mikrotik.user },
        { key: 'mikrotik.password', value: config.mikrotik.password }
    ];

    const missing = required.filter(r => !r.value);

    if (missing.length > 0) {
        throw new Error(
            `Missing required configuration: ${missing.map(m => m.key).join(', ')}\n` +
            'Please check your .env file'
        );
    }

    // Warn about optional but recommended config
    if (!config.email.user || !config.email.pass) {
        console.warn('⚠️  Email configuration missing - alerts will not be sent via email');
    }

    if (!config.telegram.enabled) {
        console.warn('⚠️  Telegram configuration missing - alerts will not be sent via Telegram');
    }
}

// Validate on load
validateConfig();

module.exports = config;
