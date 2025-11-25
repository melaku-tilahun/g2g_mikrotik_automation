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
                logFormat
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
