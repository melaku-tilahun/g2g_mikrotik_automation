// monitor.js
const db = require('./db');
const { write } = require('./mikrotik');
const { sendAlert } = require('./email');

const ALERT_DELAY_MS = 5 * 60 * 1000;      // 5 min
const SECOND_ALERT_MS = 24 * 60 * 60 * 1000; // 24h

const tracking = new Map();

async function checkTraffic() {
    try {
        const rows = await write('/queue/simple/print');
        const statuses = Object.fromEntries(
            db.prepare('SELECT name, status, threshold_kb FROM statuses').all()
                .map(r => [r.name, { status: r.status, threshold: r.threshold_kb || 0 }])
        );

        const now = Date.now();

        for (const q of rows) {
            if (!q.name?.startsWith('GPON')) continue;

            const name = q.name;
            const target = q.target || 'N/A';
            const config = statuses[name] || { status: 'Inactive', threshold: 10 };

            if (config.status !== 'Active') {
                tracking.delete(name);
                continue;
            }

            const rx = parseInt(q.rate?.split('/')[0] || 0);
            const tx = parseInt(q.rate?.split('/')[1] || 0);
            const totalKb = (rx + tx) / 1024;

            // Log traffic
            db.prepare(`
                INSERT INTO traffic_log (name, rx, tx, timestamp)
                VALUES (?, ?, ?, ?)
            `).run(name, rx, tx, Math.floor(now / 1000));

            // Alert logic
            let track = tracking.get(name) || { first: null, alerted: false, second: false };

            if (totalKb < config.threshold) {
                if (!track.first) track.first = now;

                if (!track.alerted && now - track.first >= ALERT_DELAY_MS) {
                    await sendAlert(name, totalKb, target);
                    track.alerted = true;
                }

                if (track.alerted && !track.second && now - track.first >= SECOND_ALERT_MS) {
                    await sendAlert(name, totalKb, target, true);
                    track.second = true;
                }
            } else {
                tracking.delete(name);
                continue;
            }

            tracking.set(name, track);
        }
    } catch (err) {
        console.error('Monitor error:', err.message);
    }
}

// Run every 30 seconds
setInterval(checkTraffic, 30_000);
checkTraffic(); // Initial run

module.exports = { checkTraffic };