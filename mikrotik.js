// mikrotik.js
const { RouterOSAPI } = require('node-routeros');
const config = require('./config/default');
const logger = require('./utils/logger');
const { metrics } = require('./middleware/metrics');

const api = new RouterOSAPI({
    host: config.mikrotik.host,
    user: config.mikrotik.user,
    password: config.mikrotik.password,
    port: config.mikrotik.port,
    timeout: config.mikrotik.timeout
});

let connected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT = config.mikrotik.maxReconnectAttempts;

/**
 * Connect to MikroTik with exponential backoff
 */
async function connect() {
    while (reconnectAttempts < MAX_RECONNECT) {
        try {
            if (!connected) {
                const startTime = Date.now();
                await api.connect();
                connected = true;
                reconnectAttempts = 0;
                
                const duration = (Date.now() - startTime) / 1000;
                logger.mikrotik('Connected successfully', { 
                    host: config.mikrotik.host,
                    duration: `${duration.toFixed(2)}s`
                });
            }
            return api;
        } catch (err) {
            connected = false;
            reconnectAttempts++;
            
            const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
            const errorType = err.code || 'unknown';
            
            logger.error('MikroTik connection failed', {
                attempt: reconnectAttempts,
                maxAttempts: MAX_RECONNECT,
                retryIn: `${delay / 1000}s`,
                error: err.message,
                errorType
            });

            metrics.mikrotikApiErrors.labels(errorType).inc();
            
            await new Promise(r => setTimeout(r, delay));
        }
    }
    
    const error = new Error('MikroTik connection failed after max retries');
    logger.error(error.message, { attempts: MAX_RECONNECT });
    throw error;
}

/**
 * Execute MikroTik API command with metrics tracking
 */
async function write(...args) {
    const startTime = Date.now();
    
    try {
        await connect();
        const result = await api.write(...args);
        
        const duration = (Date.now() - startTime) / 1000;
        metrics.mikrotikApiDuration.observe(duration);
        
        logger.mikrotik('API command executed', { 
            command: args[0],
            duration: `${duration.toFixed(3)}s`
        });
        
        return result;
    } catch (err) {
        const duration = (Date.now() - startTime) / 1000;
        const errorType = err.code || 'api_error';
        
        logger.error('MikroTik API command failed', {
            command: args[0],
            error: err.message,
            duration: `${duration.toFixed(3)}s`
        });
        
        metrics.mikrotikApiErrors.labels(errorType).inc();
        connected = false; // Force reconnect on next call
        
        throw err;
    }
}

/**
 * Close connection gracefully
 */
function close() {
    if (connected) {
        logger.mikrotik('Closing connection');
        api.close?.();
        connected = false;
    }
}

// Graceful shutdown
process.on('exit', () => {
    close();
});

process.on('SIGTERM', () => {
    close();
});

module.exports = { write, close };