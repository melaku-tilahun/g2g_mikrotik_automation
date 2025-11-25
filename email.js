// email.js
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendAlert(name, kb, ip, isSecond = false) {
    const subject = isSecond
        ? `SECOND ALERT: ${name} STILL low traffic`
        : `ALERT: ${name} low traffic detected`;

    await transporter.sendMail({
        from: `"GPON Monitor" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_TO,
        subject,
        text: `
Queue: ${name}
IP: ${ip}
Traffic: ${kb.toFixed(2)} KB/s
Time: ${new Date().toLocaleString()}
${isSecond ? "\nThis condition has persisted for over 24 hours." : ""}
        `.trim()
    });
}

module.exports = { sendAlert };