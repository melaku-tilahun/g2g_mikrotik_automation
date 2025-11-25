// services/AlertManager.js
const db = require('../db');
const notificationService = require('./NotificationService');
const logger = require('../utils/logger');
const { metrics } = require('../middleware/metrics');
const config = require('../config/default');

/**
 * Centralized alert management service
 * Handles alert lifecycle: triggered → notified → resolved
 */
class AlertManager {
    constructor() {
        this.tracking = new Map();
        
        // Restore state from database on startup
        this.restoreState();
        
        // Log alert configuration
        logger.info('AlertManager initialized', {
            firstAlertDelay: `${config.alertConfig.firstAlertDelayMinutes} minutes`,
            secondAlertDelay: `${config.alertConfig.secondAlertDelayHours} hours`,
            defaultThreshold: `${config.alertConfig.defaultThreshold} KB/s`,
            recoveryNotifications: config.alertConfig.sendRecoveryNotifications
        });
    }

    /**
     * Restore alert tracking state from database
     */
    restoreState() {
        try {
            const activeAlerts = db.prepare(`
                SELECT name, start_time, notified_first, notified_second
                FROM alerts
                WHERE end_time IS NULL
            `).all();

            activeAlerts.forEach(alert => {
                this.tracking.set(alert.name, {
                    first: alert.start_time * 1000,
                    alerted: alert.notified_first === 1,
                    second: alert.notified_second === 1
                });
            });

            logger.info(`Restored ${activeAlerts.length} active alerts from database`);
        } catch (err) {
            logger.error('Failed to restore alert state', { error: err.message });
        }
    }

    /**
     * Check and process alert for a queue
     * @param {string} name - Queue name
     * @param {number} totalKb - Current traffic in KB/s
     * @param {string} target - IP address
     * @param {number} threshold - Alert threshold
     */
    async checkAlert(name, totalKb, target, threshold) {
        const now = Date.now();
        let track = this.tracking.get(name) || { first: null, alerted: false, second: false };

        if (totalKb < threshold) {
            // Traffic is below threshold
            if (!track.first) {
                // First time below threshold
                track.first = now;
                this.createAlertRecord(name);
                logger.alert(`Traffic below threshold for ${name}`, { 
                    traffic: totalKb, 
                    threshold,
                    ip: target 
                });
            }

            // Check if first alert should be sent
            if (!track.alerted && now - track.first >= config.monitoring.alertDelayMs) {
                await this.sendFirstAlert(name, totalKb, target, threshold);
                track.alerted = true;
            }

            // Check if second alert should be sent
            if (track.alerted && !track.second && now - track.first >= config.monitoring.secondAlertMs) {
                await this.sendSecondAlert(name, totalKb, target, threshold);
                track.second = true;
            }

            this.tracking.set(name, track);
        } else {
            // Traffic is back above threshold
            if (track.first) {
                await this.sendRecoveryNotification(name, totalKb, target);
                this.resolveAlert(name);
            }
            this.tracking.delete(name);
        }
    }

    /**
     * Create alert record in database
     */
    createAlertRecord(name) {
        try {
            db.prepare(`
                INSERT INTO alerts (name, start_time)
                VALUES (?, unixepoch())
            `).run(name);
        } catch (err) {
            logger.error('Failed to create alert record', { name, error: err.message });
        }
    }

    /**
     * Send first alert notification
     */
    async sendFirstAlert(name, kb, ip, threshold) {
        try {
            // Send via unified notification service
            const results = await notificationService.sendAlert({
                name,
                trafficKb: kb,
                ip,
                threshold,
                type: 'first'
            });

            // Update database
            db.prepare(`
                UPDATE alerts 
                SET notified_first = 1
                WHERE name = ? AND end_time IS NULL
            `).run(name);

            // Record in alert history
            this.recordAlertHistory(name, 'first', kb, threshold);

            // Update metrics for each channel
            results.forEach(result => {
                if (result.status === 'fulfilled' && result.value.success) {
                    metrics.alertsTotal.labels('first', result.value.channel).inc();
                }
            });

        } catch (err) {
            logger.error('Failed to send first alert', { name, error: err.message });
        }
    }

    /**
     * Send second alert notification (after configured hours)
     */
    async sendSecondAlert(name, kb, ip, threshold) {
        try {
            // Send via unified notification service
            const results = await notificationService.sendAlert({
                name,
                trafficKb: kb,
                ip,
                threshold,
                type: 'second'
            });

            // Update database
            db.prepare(`
                UPDATE alerts 
                SET notified_second = 1
                WHERE name = ? AND end_time IS NULL
            `).run(name);

            // Record in alert history
            this.recordAlertHistory(name, 'second', kb, threshold);

            // Update metrics for each channel
            results.forEach(result => {
                if (result.status === 'fulfilled' && result.value.success) {
                    metrics.alertsTotal.labels('second', result.value.channel).inc();
                }
            });

        } catch (err) {
            logger.error('Failed to send second alert', { name, error: err.message });
        }
    }

    /**
     * Send recovery notification when traffic returns to normal
     */
    async sendRecoveryNotification(name, kb, ip) {
        try {
            logger.info(`Traffic recovered for ${name}`, { traffic: kb });
            
            // Send recovery notification if enabled in config
            if (config.alertConfig.sendRecoveryNotifications) {
                await notificationService.sendAlert({
                    name,
                    trafficKb: kb,
                    ip,
                    threshold: 0,
                    type: 'recovery'
                });
            }

            this.recordAlertHistory(name, 'recovery', kb, 0);
        } catch (err) {
            logger.error('Failed to send recovery notification', { name, error: err.message });
        }
    }

    /**
     * Resolve alert in database
     */
    resolveAlert(name) {
        try {
            db.prepare(`
                UPDATE alerts 
                SET end_time = unixepoch()
                WHERE name = ? AND end_time IS NULL
            `).run(name);
        } catch (err) {
            logger.error('Failed to resolve alert', { name, error: err.message });
        }
    }

    /**
     * Record alert in history table
     */
    recordAlertHistory(name, alertType, trafficKb, thresholdKb) {
        try {
            db.prepare(`
                INSERT INTO alert_history (name, alert_type, traffic_kb, threshold_kb, triggered_at)
                VALUES (?, ?, ?, ?, unixepoch())
            `).run(name, alertType, trafficKb, thresholdKb);
        } catch (err) {
            logger.error('Failed to record alert history', { name, error: err.message });
        }
    }

    /**
     * Get alert statistics
     */
    getStatistics() {
        try {
            const stats = db.prepare(`
                SELECT 
                    COUNT(*) as total_alerts,
                    SUM(CASE WHEN end_time IS NULL THEN 1 ELSE 0 END) as active_alerts,
                    SUM(CASE WHEN notified_first = 1 THEN 1 ELSE 0 END) as first_notifications,
                    SUM(CASE WHEN notified_second = 1 THEN 1 ELSE 0 END) as second_notifications
                FROM alerts
                WHERE start_time > unixepoch() - 86400
            `).get();

            return stats;
        } catch (err) {
            logger.error('Failed to get alert statistics', { error: err.message });
            return null;
        }
    }

    /**
     * Persist current state to database before shutdown
     */
    persistState() {
        logger.info('Persisting alert state before shutdown');
        // State is already in database via createAlertRecord/resolveAlert
        // This method is for future enhancements
    }
}

// Singleton instance
const alertManager = new AlertManager();

// Graceful shutdown handler
process.on('SIGTERM', () => {
    alertManager.persistState();
});

process.on('SIGINT', () => {
    alertManager.persistState();
    process.exit(0);
});

module.exports = alertManager;
