// monitor.js
const config = require('./config/default');
const logger = require('./utils/logger');
const db = require('./db');
const { write } = require('./mikrotik');
const alertManager = require('./services/AlertManager');
const { metrics } = require('./middleware/metrics');

/**
 * Main monitoring loop
 * Polls MikroTik for queue data and checks for alerts
 */
async function checkTraffic() {
    const startTime = Date.now();
    
    try {
        logger.monitor('Starting traffic check');
        
        // Fetch queue data from MikroTik
        const rows = await write('/queue/simple/print');
        
        // Get status configuration from database
        const statuses = Object.fromEntries(
            db.prepare('SELECT name, status, threshold_kb FROM statuses').all()
                .map(r => [r.name, { status: r.status, threshold: r.threshold_kb || config.monitoring.defaultThreshold }])
        );

        const now = Date.now();
        let activeCount = 0;
        let processedCount = 0;

        for (const q of rows) {
            if (!q.name?.startsWith('GPON')) {
                continue;
            }

            const name = q.name;
            const target = q.target || 'N/A';
            const queueConfig = statuses[name] || { 
                status: 'Inactive', 
                threshold: config.monitoring.defaultThreshold 
            };

            // Skip inactive queues
            if (queueConfig.status !== 'Active') {
                continue;
            }

            activeCount++;

            // Parse traffic data
            const rx = parseInt(q.rate?.split('/')[0] || 0);
            const tx = parseInt(q.rate?.split('/')[1] || 0);
            const totalKb = (rx + tx) / 1024;

            // Log traffic to database
            try {
                db.prepare(`
                    INSERT INTO traffic_log (name, rx, tx, timestamp)
                    VALUES (?, ?, ?, ?)
                `).run(name, rx, tx, Math.floor(now / 1000));
            } catch (err) {
                logger.error('Failed to log traffic', { name, error: err.message });
            }

            // Check for alerts using AlertManager
            await alertManager.checkAlert(name, totalKb, target, queueConfig.threshold);
            
            processedCount++;
        }

        // Update metrics
        metrics.activeGponCount.set(activeCount);

        const duration = (Date.now() - startTime) / 1000;
        logger.monitor(`Traffic check completed`, { 
            duration: `${duration.toFixed(2)}s`,
            activeQueues: activeCount,
            processed: processedCount
        });

        // Record health metric
        db.prepare(`
            INSERT INTO health_metrics (metric_name, metric_value)
            VALUES ('monitor_duration_seconds', ?)
        `).run(duration);

    } catch (err) {
        logger.error('Monitor error', { error: err.message, stack: err.stack });
        metrics.mikrotikApiErrors.labels('monitor_error').inc();
        
        // Record error metric
        db.prepare(`
            INSERT INTO health_metrics (metric_name, metric_value)
            VALUES ('monitor_errors', 1)
        `).run();
    }
}

// Run monitoring loop
const POLL_INTERVAL = config.monitoring.pollInterval;
logger.info(`Starting monitor with ${POLL_INTERVAL / 1000}s interval`);

setInterval(checkTraffic, POLL_INTERVAL);
checkTraffic(); // Initial run

module.exports = { checkTraffic };