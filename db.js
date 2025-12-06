// db.js
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'gpon.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB cache

// Enhanced schema
db.exec(`
CREATE TABLE IF NOT EXISTS statuses (
    name TEXT PRIMARY KEY,
    status TEXT CHECK(status IN ('Active', 'Inactive')) DEFAULT 'Inactive',
    threshold_kb INTEGER DEFAULT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS traffic_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    rx INTEGER,
    tx INTEGER,
    timestamp INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(name) REFERENCES statuses(name)
);

CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    start_time INTEGER,
    end_time INTEGER,
    first_alert_sent_at INTEGER,
    notified_first BOOLEAN DEFAULT 0,
    notified_second BOOLEAN DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_traffic_name_time ON traffic_log(name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(name, end_time) WHERE end_time IS NULL;

CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    role TEXT DEFAULT 'viewer' CHECK(role IN ('super_admin', 'admin', 'viewer')),
    created_at INTEGER DEFAULT (unixepoch()),
    last_login INTEGER,
    is_active BOOLEAN DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    timestamp INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(user_id) REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS health_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name TEXT,
    metric_value REAL,
    timestamp INTEGER DEFAULT (unixepoch())
);
`);

// Migration: Add columns if they don't exist
try {
    // Profiles migrations
    const profileColumns = db.pragma('table_info(profiles)');
    const hasFirstName = profileColumns.some(c => c.name === 'first_name');
    const hasLastName = profileColumns.some(c => c.name === 'last_name');
    
    if (!hasFirstName) {
        db.exec("ALTER TABLE profiles ADD COLUMN first_name TEXT");
        console.log('Migrated: Added first_name column to profiles');
    }
    if (!hasLastName) {
        db.exec("ALTER TABLE profiles ADD COLUMN last_name TEXT");
        console.log('Migrated: Added last_name column to profiles');
    }

    // Audit logs migrations
    const auditColumns = db.pragma('table_info(audit_logs)');
    const hasUsername = auditColumns.some(c => c.name === 'username');
    
    if (!hasUsername) {
        db.exec("ALTER TABLE audit_logs ADD COLUMN username TEXT");
        console.log('Migrated: Added username column to audit_logs');
    }

    // Health metrics migration (fix schema mismatch)
    const healthColumns = db.pragma('table_info(health_metrics)');
    const hasMetricName = healthColumns.some(c => c.name === 'metric_name');
    
    if (healthColumns.length > 0 && !hasMetricName) {
        // Table exists but has wrong schema (from previous incorrect definition)
        db.exec("DROP TABLE health_metrics");
        db.exec(`
            CREATE TABLE health_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_name TEXT,
                metric_value REAL,
                timestamp INTEGER DEFAULT (unixepoch())
            )
        `);
        console.log('Migrated: Recreated health_metrics table with correct schema');
    }
} catch (error) {
    console.error('Migration error:', error.message);
}

module.exports = db;