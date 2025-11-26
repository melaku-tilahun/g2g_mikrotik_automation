const db = require('../db');
const logger = require('../utils/logger');

try {
    console.log('Starting schema migration...');
    
    // Check if column exists
    const tableInfo = db.prepare('PRAGMA table_info(alerts)').all();
    const hasColumn = tableInfo.some(col => col.name === 'first_alert_sent_at');

    if (!hasColumn) {
        console.log('Adding first_alert_sent_at column to alerts table...');
        db.prepare('ALTER TABLE alerts ADD COLUMN first_alert_sent_at INTEGER').run();
        console.log('Migration successful.');
    } else {
        console.log('Column first_alert_sent_at already exists.');
    }

} catch (err) {
    console.error('Migration failed:', err);
}
