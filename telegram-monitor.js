// telegram-monitor.js  ← NEW FILE (runs side-by-side with monitor.js)
require('dotenv').config();
const db = require('./db');
const { write } = require('./mikrotik');
const axios = require('axios');

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TOKEN || !CHAT_ID) {
    console.log("Telegram not configured → telegram-monitor disabled");
    process.exit(0);
}

const ALERT_DELAY_MS = 5 * 60 * 1000;      // 5 minutes
const SECOND_ALERT_MS = 24 * 60 * 60 * 1000; // 24 hours
const tracking = new Map();

async function sendTelegram(name, kb, ip, threshold, isSecond = false) {
    const text = isSecond
        ? `SECOND ALERT: ${name} STILL DOWN!\nStill below ${threshold} KB/s for over 24 hours!\n\nIP: ${ip}\nCurrent: ${kb.toFixed(2)} KB/s`
        : `ALERT: ${name} low traffic detected\nIP: ${ip}\nCurrent: ${kb.toFixed(2)} KB/s\nThreshold: ${threshold} KB/s`;

    try {
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: text,
            parse_mode: 'HTML'
        });
        console.log("Telegram →", isSecond ? "2nd alert" : "1st alert", name);
    } catch (err) {
        console.error("Telegram failed:", err.response?.data?.description || err.message);
    }
}

async function checkTrafficForTelegram() {
    try {
        const rows = await write('/queue/simple/print');
        const statuses = Object.fromEntries(
            db.prepare('SELECT name, status, threshold_kb FROM statuses').all()
                .map(r => [r.name, { status: r.status, threshold: r.threshold_kb || 25 }])
        );

        const now = Date.now();

        for (const q of rows) {
            if (!q.name?.startsWith('GPON')) continue;

            const name = q.name;
            const target = q.target || 'N/A';
            const config = statuses[name] || { status: 'Inactive', threshold: 25 };

            if (config.status !== 'Active') {
                tracking.delete(name);
                continue;
            }

            const rx = parseInt(q.rate?.split('/')[0] || 0);
            const tx = parseInt(q.rate?.split('/')[1] || 0);
            const totalKb = (rx + tx) / 1024;

            let track = tracking.get(name) || { first: null, alerted: false, second: false };

            if (totalKb < config.threshold) {
                if (!track.first) track.first = now;

                if (!track.alerted && now - track.first >= ALERT_DELAY_MS) {
                    await sendTelegram(name, totalKb, target, config.threshold, false);
                    track.alerted = true;
                }

                if (track.alerted && !track.second && now - track.first >= SECOND_ALERT_MS) {
                    await sendTelegram(name, totalKb, target, config.threshold, true);
                    track.second = true;
                }
            } else {
                tracking.delete(name);
                continue;
            }

            tracking.set(name, track);
        }
    } catch (err) {
        console.error("Telegram monitor error:", err.message);
    }
}

// Run every 30 seconds — completely independent
setInterval(checkTrafficForTelegram, 30_000);
checkTrafficForTelegram(); // first run

console.log("Telegram monitor started – sending alerts to chat", CHAT_ID);