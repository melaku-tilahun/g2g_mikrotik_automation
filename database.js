// database.js
const Database = require("better-sqlite3");
const db = new Database("gpon.db");

// Table for queue statuses (Active/Inactive)
db.prepare(`
CREATE TABLE IF NOT EXISTS statuses (
    name TEXT PRIMARY KEY,
    status TEXT
)
`).run();

// Table for traffic history
db.prepare(`
CREATE TABLE IF NOT EXISTS traffic_history (
    name TEXT,
    rx INTEGER,
    tx INTEGER,
    timestamp INTEGER
)
`).run();

module.exports = db;
