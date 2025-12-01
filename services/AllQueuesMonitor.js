// services/AllQueuesMonitor.js
const config = require('../config/default');
const logger = require('../utils/logger');
const db = require('../db');
const { write } = require('../mikrotik');

/**
 * Monitor service for ALL queues (not just GPON)
 * Collects traffic data and stores in all_queues_traffic_log
 */
class AllQueuesMonitor {
    constructor() {
        this.pollInterval = config.monitoring.pollInterval;
        this.intervalId = null;
    }

    /**
     * Start monitoring all queues
     */
    start() {
        logger.info(`Starting All Queues Monitor with ${this.pollInterval / 1000}s interval`);
        
        // Initial run
        this.checkTraffic();
        
        // Schedule periodic checks
        this.intervalId = setInterval(() => this.checkTraffic(), this.pollInterval);
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger.info('All Queues Monitor stopped');
        }
    }

    /**
     * Check traffic for all queues
     */
    async checkTraffic() {
        const startTime = Date.now();
        
        try {
            logger.monitor('Checking all queues traffic');
            
            // Fetch all queues from MikroTik
            const queues = await write('/queue/simple/print');
            
            const now = Date.now();
            let processedCount = 0;

            for (const q of queues) {
                if (!q.name) {
                    continue;
                }

                const name = q.name;
                
                // Parse traffic data
                const rx = parseInt(q.rate?.split('/')[0] || 0);
                const tx = parseInt(q.rate?.split('/')[1] || 0);

                // Log traffic to database
                try {
                    db.prepare(`
                        INSERT INTO all_queues_traffic_log (name, rx, tx, timestamp)
                        VALUES (?, ?, ?, ?)
                    `).run(name, rx, tx, Math.floor(now / 1000));
                } catch (err) {
                    logger.error('Failed to log queue traffic', { name, error: err.message });
                }
                
                processedCount++;
            }

            const duration = (Date.now() - startTime) / 1000;
            logger.monitor(`All queues traffic check completed`, { 
                duration: `${duration.toFixed(2)}s`,
                totalQueues: queues.length,
                processed: processedCount
            });

        } catch (err) {
            logger.error('All Queues Monitor error', { error: err.message, stack: err.stack });
        }
    }
}

// Singleton instance
const allQueuesMonitor = new AllQueuesMonitor();

// Graceful shutdown
process.on('SIGTERM', () => {
    allQueuesMonitor.stop();
});

process.on('SIGINT', () => {
    allQueuesMonitor.stop();
    process.exit(0);
});

module.exports = allQueuesMonitor;
