// scripts/update_role_schema.js
// Update database schema to support new role names
// This must run BEFORE migrate_roles.js

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'gpon.db');
const db = new Database(dbPath);

console.log('Updating database schema for new role system...');

try {
    // Disable foreign keys temporarily
    console.log('0. Disabling foreign key constraints...');
    db.pragma('foreign_keys = OFF');
    
    // SQLite doesn't support modifying CHECK constraints directly
    // We need to recreate the table
    
    const transaction = db.transaction(() => {
        console.log('1. Creating backup of profiles table...');
        db.exec(`
            CREATE TABLE profiles_backup AS 
            SELECT * FROM profiles
        `);
        
        console.log('2. Dropping old profiles table...');
        db.exec('DROP TABLE profiles');
        
        console.log('3. Creating new profiles table with updated role constraint...');
        db.exec(`
            CREATE TABLE profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                first_name TEXT,
                last_name TEXT,
                full_name TEXT,
                role TEXT DEFAULT 'viewer' CHECK(role IN ('super_admin', 'admin', 'viewer')),
                created_at INTEGER DEFAULT (unixepoch()),
                last_login INTEGER,
                is_active BOOLEAN DEFAULT 1
            )
        `);
        
        console.log('4. Restoring data from backup...');
        db.exec(`
            INSERT INTO profiles 
            SELECT * FROM profiles_backup
        `);
        
        console.log('5. Recreating indexes...');
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
            CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
        `);
        
        console.log('6. Dropping backup table...');
        db.exec('DROP TABLE profiles_backup');
        
        console.log('7. Verifying schema...');
        const tableInfo = db.pragma('table_info(profiles)');
        const roleColumn = tableInfo.find(col => col.name === 'role');
        console.log('   Role column definition:', roleColumn);
    });
    
    transaction();
    
    // Re-enable foreign keys
    console.log('8. Re-enabling foreign key constraints...');
    db.pragma('foreign_keys = ON');
    
    console.log('\n✅ Schema update completed successfully!');
    console.log('You can now run: node scripts/migrate_roles.js');
    
} catch (error) {
    console.error('\n❌ Schema update failed:', error.message);
    console.error(error.stack);
    // Re-enable foreign keys even on error
    try {
        db.pragma('foreign_keys = ON');
    } catch (e) {
        // Ignore
    }
    process.exit(1);
} finally {
    db.close();
}
