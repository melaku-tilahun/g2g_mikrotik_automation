// utils/logger.js
const winston = require('winston');
const path = require('path');

/**
 * Structured logging utility using Winston
 * Replaces console.log with proper log levels and formatting
 */

const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(info => {
        const { timestamp, level, message, ...meta } = info;
        let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        
        if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`;
        }
        
        return log;
    })
);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        // Console output
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(info => {
                    const { timestamp, level, message, ...meta } = info;
                    
                    // ANSI Color Codes
                    const colors = {
                        reset: "\x1b[0m",
                        cyan: "\x1b[36m",
                        red: "\x1b[31m",
                        yellow: "\x1b[33m",
                        magenta: "\x1b[35m",
                        blue: "\x1b[34m",
                        green: "\x1b[32m",
                        gray: "\x1b[90m"
                    };

                    // Add icons and colors based on level/message tags
                    let icon = 'ℹ️';
                    let color = colors.green; // Default info color

                    if (level.includes('error')) { icon = '❌'; color = colors.red; }
                    else if (level.includes('warn')) { icon = '⚠️'; color = colors.yellow; }
                    else if (message.includes('[MONITOR]')) { icon = '📡'; color = colors.cyan; }
                    else if (message.includes('[ALERT]')) { icon = '🚨'; color = colors.red; }
                    else if (message.includes('[MIKROTIK]')) { icon = '🔌'; color = colors.magenta; }
                    else if (message.includes('[DATABASE]')) { icon = '💾'; color = colors.blue; }
                    
                    // Clean up message tags if we have icons
                    const cleanMessage = message
                        .replace('[MONITOR]', '')
                        .replace('[ALERT]', '')
                        .replace('[MIKROTIK]', '')
                        .replace('[DATABASE]', '')
                        .trim();

                    // Format: Timestamp [Icon] Level: Message (Colored)
                    let log = `${colors.gray}${timestamp}${colors.reset} ${icon} ${level}: ${color}${cleanMessage}${colors.reset}`;
                    
                    if (Object.keys(meta).length > 0) {
                        // Pretty print JSON on new lines
                        log += `\n${colors.gray}${JSON.stringify(meta, null, 2).replace(/^/gm, '    ')}${colors.reset}`;
                    }
                    
                    return log;
                })
            )
        }),
        // Error log file
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // Combined log file
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

/**
 * Log monitoring events
 */
logger.monitor = (message, meta = {}) => {
    logger.info(`[MONITOR] ${message}`, meta);
};

/**
 * Log alert events
 */
logger.alert = (message, meta = {}) => {
    logger.warn(`[ALERT] ${message}`, meta);
};

/**
 * Log MikroTik API events
 */
logger.mikrotik = (message, meta = {}) => {
    logger.debug(`[MIKROTIK] ${message}`, meta);
};

/**
 * Log database events
 */
logger.database = (message, meta = {}) => {
    logger.debug(`[DATABASE] ${message}`, meta);
};

module.exports = logger;
