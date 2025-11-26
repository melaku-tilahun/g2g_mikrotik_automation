const db = require('../db');

console.log('--- Statuses (Thresholds) ---');
const statuses = db.prepare('SELECT name, status, threshold_kb FROM statuses').all();
console.table(statuses);

console.log('\n--- Active Alerts ---');
const activeAlerts = db.prepare('SELECT * FROM alerts WHERE end_time IS NULL').all();
console.table(activeAlerts);

console.log('\n--- Recent Alert History (Last 10) ---');
const history = db.prepare('SELECT * FROM alert_history ORDER BY triggered_at DESC LIMIT 10').all();
console.table(history);
