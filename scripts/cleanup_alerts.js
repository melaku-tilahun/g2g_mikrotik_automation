// scripts/cleanup_alerts.js
// Script to clean up stuck alerts and reset the alert system
const db = require('../db');
const logger = require('../utils/logger');

console.log('🧹 Alert Cleanup Script');
console.log('========================\n');

try {
    // Show current alert state
    const activeAlerts = db.prepare(`
        SELECT name, 
               datetime(start_time, 'unixepoch') as started,
               datetime(first_alert_sent_at, 'unixepoch') as first_sent,
               notified_first, 
               notified_second
        FROM alerts
        WHERE end_time IS NULL
    `).all();

    console.log(`Found ${activeAlerts.length} active alerts:\n`);
    activeAlerts.forEach(alert => {
        console.log(`  ${alert.name}:`);
        console.log(`    Started: ${alert.started}`);
        console.log(`    First Alert Sent: ${alert.first_sent || 'Not sent'}`);
        console.log(`    Notified First: ${alert.notified_first ? 'Yes' : 'No'}`);
        console.log(`    Notified Second: ${alert.notified_second ? 'Yes' : 'No'}`);
        console.log('');
    });

    // Close all active alerts
    const result = db.prepare(`
        UPDATE alerts 
        SET end_time = unixepoch()
        WHERE end_time IS NULL
    `).run();

    console.log(`✅ Closed ${result.changes} active alerts`);
    console.log('\n📊 Alert Statistics:');
    
    const stats = db.prepare(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN notified_first = 1 THEN 1 ELSE 0 END) as first_sent,
            SUM(CASE WHEN notified_second = 1 THEN 1 ELSE 0 END) as second_sent
        FROM alerts
        WHERE start_time > unixepoch() - 86400
    `).get();

    console.log(`  Total alerts (last 24h): ${stats.total}`);
    console.log(`  First alerts sent: ${stats.first_sent}`);
    console.log(`  Second alerts sent: ${stats.second_sent}`);

    console.log('\n✨ Alert system has been reset!');
    console.log('You can now restart the application with: npm start');

} catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
}
