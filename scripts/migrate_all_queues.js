// scripts/migrate_all_queues.js
// Migration script to create tables for All Queues Monitor feature
const db = require('../db');
const logger = require('../utils/logger');

console.log('🔄 All Queues Monitor - Database Migration');
console.log('==========================================\n');

try {
    // Create all_queues_traffic_log table
    console.log('Creating all_queues_traffic_log table...');
    db.exec(`
        CREATE TABLE IF NOT EXISTS all_queues_traffic_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            rx INTEGER NOT NULL,
            tx INTEGER NOT NULL,
            timestamp INTEGER NOT NULL
        );
    `);
    console.log('✅ all_queues_traffic_log table created');

    // Create indexes for performance
    console.log('Creating indexes...');
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_all_queues_traffic_name_time 
        ON all_queues_traffic_log(name, timestamp DESC);
    `);
    console.log('✅ Indexes created');

    // Verify tables
    console.log('\n📊 Verifying tables...');
    const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name LIKE 'all_queues%'
        ORDER BY name
    `).all();

    console.log(`Found ${tables.length} all_queues tables:`);
    tables.forEach(t => console.log(`  - ${t.name}`));

    // Check indexes
    const indexes = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name LIKE '%all_queues%'
        ORDER BY name
    `).all();

    console.log(`\nFound ${indexes.length} all_queues indexes:`);
    indexes.forEach(i => console.log(`  - ${i.name}`));

    console.log('\n✨ Migration completed successfully!');
    console.log('You can now start the application with: npm start');

} catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
}
