// scripts/migrate.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * Database migration script
 * Adds new tables and indexes for enhanced functionality
 */

const DB_PATH = path.join(__dirname, '../gpon.db');
const BACKUP_PATH = path.join(__dirname, `../backups/gpon_backup_${Date.now()}.db`);

console.log('🔄 Starting database migration...\n');

// Create backup
try {
    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    
    fs.copyFileSync(DB_PATH, BACKUP_PATH);
    console.log(`✅ Backup created: ${BACKUP_PATH}\n`);
} catch (err) {
    console.error('❌ Failed to create backup:', err.message);
    process.exit(1);
}

// Open database
const db = new Database(DB_PATH);

try {
    // Start transaction
    db.exec('BEGIN TRANSACTION');

    console.log('📊 Adding new tables...\n');

    // Alert history table
    db.exec(`
        CREATE TABLE IF NOT EXISTS alert_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            alert_type TEXT CHECK(alert_type IN ('first', 'second', 'recovery')),
            traffic_kb REAL,
            threshold_kb INTEGER,
            triggered_at INTEGER DEFAULT (unixepoch()),
            resolved_at INTEGER,
            notification_status TEXT
        );
    `);
    console.log('  ✓ alert_history table created');

    // System health metrics table
    db.exec(`
        CREATE TABLE IF NOT EXISTS health_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            metric_name TEXT NOT NULL,
            metric_value REAL,
            timestamp INTEGER DEFAULT (unixepoch())
        );
    `);
    console.log('  ✓ health_metrics table created');

    // Configuration audit log
    db.exec(`
        CREATE TABLE IF NOT EXISTS config_changes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            field TEXT,
            old_value TEXT,
            new_value TEXT,
            changed_at INTEGER DEFAULT (unixepoch()),
            changed_by TEXT
        );
    `);
    console.log('  ✓ config_changes table created');

    console.log('\n📈 Creating indexes...\n');

    // Composite index for traffic queries
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_traffic_name_time_composite 
        ON traffic_log(name, timestamp DESC, rx, tx);
    `);
    console.log('  ✓ idx_traffic_name_time_composite created');

    // Index for alert history
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_alert_history_name_time 
        ON alert_history(name, triggered_at DESC);
    `);
    console.log('  ✓ idx_alert_history_name_time created');

    // Index for health metrics
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_health_metrics_time 
        ON health_metrics(timestamp DESC);
    `);
    console.log('  ✓ idx_health_metrics_time created');

    // Commit transaction
    db.exec('COMMIT');

    console.log('\n✅ Migration completed successfully!\n');

    // Show table counts
    const tables = ['statuses', 'traffic_log', 'alerts', 'alert_history', 'health_metrics', 'config_changes'];
    console.log('📊 Table row counts:');
    tables.forEach(table => {
        try {
            const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
            console.log(`  ${table}: ${count.count} rows`);
        } catch (err) {
            console.log(`  ${table}: N/A`);
        }
    });

} catch (err) {
    // Rollback on error
    db.exec('ROLLBACK');
    console.error('\n❌ Migration failed:', err.message);
    console.error('Database rolled back to previous state');
    process.exit(1);
} finally {
    db.close();
}

console.log('\n🎉 Migration complete! You can now restart the application.\n');
