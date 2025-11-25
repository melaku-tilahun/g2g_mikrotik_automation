// mikrotik.js
const { RouterOSAPI } = require('node-routeros');
require('dotenv').config();

const api = new RouterOSAPI({
    host: process.env.MIKROTIK_HOST,
    user: process.env.MIKROTIK_USER,
    password: process.env.MIKROTIK_PASS,
    port: parseInt(process.env.MIKROTIK_PORT) || 8728,
    timeout: 20000
});

let connected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;

async function connect() {
    while (reconnectAttempts < MAX_RECONNECT) {
        try {
            if (!connected) {
                await api.connect();
                connected = true;
                reconnectAttempts = 0;
                console.log("MikroTik connected");
            }
            return api;
        } catch (err) {
            connected = false;
            reconnectAttempts++;
            const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
            console.error(`MikroTik connect failed (attempt ${reconnectAttempts}), retry in ${delay/1000}s`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error("MikroTik connection failed after max retries");
}

async function write(...args) {
    await connect();
    return api.write(...args);
}

process.on('exit', () => api.close?.());

module.exports = { write, close: () => api.close?.() };