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
`);

module.exports = db;