const db = require('../db');
const logger = require('../utils/logger');

try {
    console.log('Starting threshold fix...');
    
    // Check current state
    const before = db.prepare('SELECT COUNT(*) as count FROM statuses WHERE threshold_kb = 5').get();
    console.log(`Found ${before.count} statuses with default threshold (5 KB/s)`);

    if (before.count > 0) {
        // Update to NULL
        const result = db.prepare('UPDATE statuses SET threshold_kb = NULL WHERE threshold_kb = 5').run();
        console.log(`Updated ${result.changes} rows to use NULL threshold (will use config default)`);
    } else {
        console.log('No rows needed updating.');
    }

    // Verify
    const after = db.prepare('SELECT COUNT(*) as count FROM statuses WHERE threshold_kb = 5').get();
    const nullCount = db.prepare('SELECT COUNT(*) as count FROM statuses WHERE threshold_kb IS NULL').get();
    
    console.log(`Verification: ${after.count} rows remaining with 5 KB/s`);
    console.log(`Total rows with NULL threshold: ${nullCount.count}`);

} catch (err) {
    console.error('Failed to run fix script:', err);
}
