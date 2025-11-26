// services/NotificationService.js
const nodemailer = require('nodemailer');
const axios = require('axios');
const config = require('../config/default');
const logger = require('../utils/logger');

/**
 * Unified notification service for scalability
 * Supports multiple channels: Email, Telegram, and future channels
 */
class NotificationService {
    constructor() {
        this.channels = [];
        this.initializeChannels();
    }

    /**
     * Initialize available notification channels
     */
    initializeChannels() {
        // Email channel
        if (config.email.user && config.email.pass && config.email.to) {
            const emailEnabled = config.alertConfig.enableEmail !== false; // Default to true
            this.channels.push({
                name: 'email',
                enabled: emailEnabled,
                send: this.sendEmail.bind(this)
            });
            logger.info(`Email notification channel ${emailEnabled ? 'enabled' : 'disabled'}`);
        }

        // Telegram channel
        if (config.telegram.enabled) {
            const telegramEnabled = config.alertConfig.enableTelegram !== false; // Default to true
            this.channels.push({
                name: 'telegram',
                enabled: telegramEnabled,
                send: this.sendTelegram.bind(this)
            });
            logger.info(`Telegram notification channel ${telegramEnabled ? 'enabled' : 'disabled'}`);
        }

        if (this.channels.length === 0) {
            logger.warn('No notification channels configured');
        }
    }

    /**
     * Send notification to all enabled channels
     * @param {Object} alert - Alert data
     * @param {string} alert.name - Queue name
     * @param {number} alert.trafficKb - Current traffic in KB/s
     * @param {string} alert.ip - IP address
     * @param {number} alert.threshold - Threshold in KB/s
     * @param {string} alert.type - Alert type: 'first', 'second', or 'recovery'
     */
    async sendAlert(alert) {
        const { name, trafficKb, ip, threshold, type } = alert;

        // Only send to enabled channels
        const enabledChannels = this.channels.filter(c => c.enabled);
        
        if (enabledChannels.length === 0) {
            logger.warn('No enabled notification channels - alert not sent', { name, type });
            return [];
        }

        const results = await Promise.allSettled(
            enabledChannels.map(async channel => {
                try {
                    await channel.send(alert);
                    logger.info(`Alert sent via ${channel.name}`, { 
                        name, 
                        type,
                        channel: channel.name 
                    });
                    return { channel: channel.name, success: true };
                } catch (err) {
                    logger.error(`Failed to send alert via ${channel.name}`, {
                        name,
                        type,
                        channel: channel.name,
                        error: err.message
                    });
                    return { channel: channel.name, success: false, error: err.message };
                }
            })
        );

        return results;
    }

    /**
     * Send email notification
     */
    async sendEmail(alert) {
        const { name, trafficKb, ip, threshold, type } = alert;

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: config.email.user,
                pass: config.email.pass
            }
        });

        const subject = this.getEmailSubject(type, name);
        const body = this.getEmailBody(alert);

        await transporter.sendMail({
            from: `"GPON Monitor" <${config.email.user}>`,
            to: config.email.to,
            subject,
            text: body
        });
    }

    /**
     * Send Telegram notification
     */
    async sendTelegram(alert) {
        const { name, trafficKb, ip, threshold, type } = alert;

        const text = this.getTelegramMessage(alert);

        await axios.post(
            `https://api.telegram.org/bot${config.telegram.token}/sendMessage`,
            {
                chat_id: config.telegram.chatId,
                text: text,
                parse_mode: 'HTML'
            }
        );
    }

    /**
     * Get email subject based on alert type
     */
    getEmailSubject(type, name) {
        switch (type) {
            case 'first':
                return `⚠️ ALERT: ${name} - Low Traffic Detected`;
            case 'second':
                return `🚨 CRITICAL: ${name} - Still Down After 1 Hour`;
            case 'recovery':
                return `✅ RECOVERED: ${name} - Traffic Restored`;
            default:
                return `ALERT: ${name}`;
        }
    }

    /**
     * Get email body text
     */
    getEmailBody(alert) {
        const { name, trafficKb, ip, threshold, type } = alert;
        const timestamp = new Date().toLocaleString();

        let body = `Queue: ${name}\n`;
        body += `IP Address: ${ip}\n`;
        body += `Current Traffic: ${trafficKb.toFixed(2)} KB/s\n`;
        body += `Threshold: ${threshold} KB/s\n`;
        body += `Time: ${timestamp}\n`;

        if (type === 'second') {
            body += `\n⚠️ CRITICAL: This queue has been down for over 1 hour!\n`;
        } else if (type === 'recovery') {
            body += `\n✅ Traffic has returned to normal levels.\n`;
        }

        return body;
    }

    /**
     * Get Telegram message text
     */
    getTelegramMessage(alert) {
        const { name, trafficKb, ip, threshold, type } = alert;

        let emoji = '⚠️';
        let title = 'ALERT';
        let extraInfo = '';

        if (type === 'second') {
            emoji = '🚨';
            title = 'CRITICAL - STILL DOWN';
            extraInfo = '\n\n⚠️ Queue has been down for over 1 hour!';
        } else if (type === 'recovery') {
            emoji = '✅';
            title = 'RECOVERED';
            extraInfo = '\n\n✅ Traffic restored to normal levels.';
        }

        // Helper to escape HTML special characters
        const escapeHtml = (unsafe) => {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        const safeName = escapeHtml(name);
        const safeIp = escapeHtml(ip);

        return `${emoji} <b>${title}: ${safeName}</b>\n\n` +
               `📍 IP: ${safeIp}\n` +
               `📊 Current Traffic: ${trafficKb.toFixed(2)} KB/s\n` +
               `📉 Threshold: ${threshold} KB/s\n` +
               `🕐 Time: ${new Date().toLocaleString()}` +
               extraInfo;
    }

    /**
     * Add a new notification channel dynamically
     * @param {string} name - Channel name
     * @param {Function} sendFunction - Function to send notification
     */
    addChannel(name, sendFunction) {
        this.channels.push({
            name,
            enabled: true,
            send: sendFunction
        });
        logger.info(`Added notification channel: ${name}`);
    }

    /**
     * Enable/disable a specific channel
     */
    setChannelStatus(channelName, enabled) {
        const channel = this.channels.find(c => c.name === channelName);
        if (channel) {
            channel.enabled = enabled;
            logger.info(`Channel ${channelName} ${enabled ? 'enabled' : 'disabled'}`);
        }
    }

    /**
     * Get list of active channels
     */
    getActiveChannels() {
        return this.channels
            .filter(c => c.enabled)
            .map(c => c.name);
    }
}

// Singleton instance
const notificationService = new NotificationService();

module.exports = notificationService;
