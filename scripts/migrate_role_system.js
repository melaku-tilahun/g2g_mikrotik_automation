// scripts/migrate_role_system.js
// Combined schema update and role migration
// This script:
// 1. Updates the database schema to allow new role names
// 2. Migrates existing role data
// All in one atomic transaction

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'gpon.db');
const db = new Database(dbPath);

const MAX_SUPER_ADMINS = 3;

console.log('='.repeat(60));
console.log('ROLE SYSTEM MIGRATION');
console.log('='.repeat(60));

try {
    // Disable foreign keys temporarily
    console.log('\n[Step 1] Disabling foreign key constraints...');
    db.pragma('foreign_keys = OFF');
    
    const transaction = db.transaction(() => {
        // Check current admin count
        console.log('\n[Step 2] Checking current role distribution...');
        const currentRoles = db.prepare(`
            SELECT role, COUNT(*) as count 
            FROM profiles 
            GROUP BY role
        `).all();
        
        console.log('Current roles:');
        currentRoles.forEach(r => console.log(`  - ${r.role}: ${r.count} user(s)`));
        
        const adminCount = db.prepare(`
            SELECT COUNT(*) as count 
            FROM profiles 
            WHERE role = 'admin'
        `).get();
        
        if (adminCount.count > MAX_SUPER_ADMINS) {
            throw new Error(
                `\n❌ Cannot migrate: You have ${adminCount.count} admin users, ` +
                `but the system only allows ${MAX_SUPER_ADMINS} super_admins.\n` +
                `Please manually reduce the number of admin users before running this migration.`
            );
        }
        
        // Create backup
        console.log('\n[Step 3] Creating backup of profiles table...');
        db.exec('DROP TABLE IF EXISTS profiles_backup');
        db.exec(`
            CREATE TABLE profiles_backup AS 
            SELECT * FROM profiles
        `);
        
        // Drop old table
        console.log('[Step 4] Dropping old profiles table...');
        db.exec('DROP TABLE profiles');
        
        // Create new table with updated schema
        console.log('[Step 5] Creating new profiles table with updated role constraint...');
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
        
        // Migrate data with role transformation
        console.log('[Step 6] Migrating data with role transformation...');
        console.log('  - admin → super_admin');
        console.log('  - user → admin');
        console.log('  - viewer → viewer (unchanged)');
        
        db.exec(`
            INSERT INTO profiles (
                id, username, email, password_hash, first_name, last_name, full_name,
                role, created_at, last_login, is_active
            )
            SELECT 
                id, username, email, password_hash, first_name, last_name, full_name,
                CASE 
                    WHEN role = 'admin' THEN 'super_admin'
                    WHEN role = 'user' THEN 'admin'
                    ELSE 'viewer'
                END as role,
                created_at, last_login, is_active
            FROM profiles_backup
        `);
        
        // Recreate indexes
        console.log('[Step 7] Recreating indexes...');
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
            CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
        `);
        
        // Drop backup
        console.log('[Step 8] Dropping backup table...');
        db.exec('DROP TABLE profiles_backup');
        
        // Verify migration
        console.log('\n[Step 9] Verifying migration...');
        const newRoles = db.prepare(`
            SELECT role, COUNT(*) as count 
            FROM profiles 
            GROUP BY role
        `).all();
        
        console.log('New role distribution:');
        newRoles.forEach(r => console.log(`  - ${r.role}: ${r.count} user(s)`));
        
        // Log migration in audit logs
        console.log('[Step 10] Recording migration in audit logs...');
        db.prepare(`
            INSERT INTO audit_logs (user_id, action, details, ip_address)
            VALUES (NULL, 'ROLE_MIGRATION', 'Migrated role system: admin→super_admin, user→admin', '127.0.0.1')
        `).run();
    });
    
    // Execute transaction
    transaction();
    
    // Re-enable foreign keys
    console.log('[Step 11] Re-enabling foreign key constraints...');
    db.pragma('foreign_keys = ON');
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Update middleware and routes to use new role names');
    console.log('2. Update frontend to display new role names');
    console.log('3. Restart the server');
    
} catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ MIGRATION FAILED');
    console.error('='.repeat(60));
    console.error('\nError:', error.message);
    console.error('\nStack trace:');
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
