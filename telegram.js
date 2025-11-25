// telegram.js
require('dotenv').config();
const axios = require('axios');

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(name, kb, ip, threshold, isSecond = false) {
    if (!TOKEN || !CHAT_ID) {
        console.log("Telegram not configured");
        return;
    }

    const text = isSecond
        ? `SECOND ALERT: ${name} STILL DOWN!\nStill below threshold for over 24 hours!\n\nIP: ${ip}\nTraffic: ${kb.toFixed(2)} KB/s\nThreshold: ${threshold} KB/s`
        : `ALERT: ${name} low traffic\nIP: ${ip}\nTraffic: ${kb.toFixed(2)} KB/s\nThreshold: ${threshold} KB/s`;

    try {
        await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: text,
            parse_mode: 'HTML'
        });
        console.log("Telegram alert sent:", name);
    } catch (err) {
        console.error("Telegram send failed:", err.response?.data || err.message);
    }
}

module.exports = { sendTelegram };