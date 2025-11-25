// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const basicAuth = require('express-basic-auth');
const trafficRouter = require('./routes/traffic');

const queuesRouter = require('./routes/queues');
const statusesRouter = require('./routes/statuses');
require('./monitor'); // Start monitoring

const app = express();
const PORT = process.env.PORT || 3000;

// Security
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

// Rate limiting
app.use('/statuses', rateLimit({ windowMs: 1*60*1000, max: 100 }));

// Optional Basic Auth
if (process.env.ADMIN_USER && process.env.ADMIN_PASS) {
    app.use('/statuses', basicAuth({
        users: { [process.env.ADMIN_USER]: process.env.ADMIN_PASS },
        challenge: true,
        realm: 'GPON Monitor'
    }));
}

app.use('/api/queues', queuesRouter);
app.use('/api/statuses', statusesRouter);
app.use('/api/traffic', trafficRouter);

app.listen(PORT, () => {
    console.log(`GPON Monitor running on http://localhost:${PORT}`);
});