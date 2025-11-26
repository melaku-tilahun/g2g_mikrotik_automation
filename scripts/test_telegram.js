const notificationService = require('../services/NotificationService');
const logger = require('../utils/logger');

async function testTelegram() {
    console.log('Testing Telegram Notification with special characters...');
    
    const mockAlert = {
        name: 'Test <Queue> & "More"',
        trafficKb: 123.45,
        ip: '192.168.1.1',
        threshold: 50,
        type: 'first'
    };

    try {
        // We can't easily mock the axios call without a library, 
        // but we can check if the function throws or logs an error.
        // Ideally, we would inspect the log output or use a mock.
        // For now, let's just run it and see if it crashes or logs success/failure.
        
        // Note: This will actually try to send to Telegram if config is valid.
        // If config is invalid/missing, it will just log a warning/error which is fine.
        
        await notificationService.sendTelegram(mockAlert);
        console.log('Test function executed (check logs for actual result)');
    } catch (err) {
        console.error('Test failed:', err);
    }
}

testTelegram();
