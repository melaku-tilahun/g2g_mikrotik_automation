// scripts/migrate_roles.js
// Migration script to update role system
// admin -> super_admin
// user -> admin
// viewer -> viewer (no change)

const db = require('../db');
const logger = require('../utils/logger');

const MAX_SUPER_ADMINS = 3;

function migrateRoles() {
    console.log('Starting role migration...');
    
    try {
        // Start transaction
        const transaction = db.transaction(() => {
            // Get current role counts
            const currentRoles = db.prepare(`
                SELECT role, COUNT(*) as count 
                FROM profiles 
                GROUP BY role
            `).all();
            
            console.log('Current role distribution:');
            currentRoles.forEach(r => console.log(`  ${r.role}: ${r.count}`));
            
            // Check if we have more than 3 admins (which will become super_admins)
            const adminCount = db.prepare(`
                SELECT COUNT(*) as count 
                FROM profiles 
                WHERE role = 'admin'
            `).get();
            
            if (adminCount.count > MAX_SUPER_ADMINS) {
                throw new Error(
                    `Cannot migrate: You have ${adminCount.count} admin users, ` +
                    `but the system only allows ${MAX_SUPER_ADMINS} super_admins. ` +
                    `Please manually reduce the number of admin users before running this migration.`
                );
            }
            
            // Migrate roles
            console.log('\nMigrating roles...');
            
            // admin -> super_admin
            const adminMigrated = db.prepare(`
                UPDATE profiles 
                SET role = 'super_admin' 
                WHERE role = 'admin'
            `).run();
            console.log(`  Migrated ${adminMigrated.changes} admin users to super_admin`);
            
            // user -> admin
            const userMigrated = db.prepare(`
                UPDATE profiles 
                SET role = 'admin' 
                WHERE role = 'user'
            `).run();
            console.log(`  Migrated ${userMigrated.changes} user users to admin`);
            
            // viewer stays the same (no action needed)
            const viewerCount = db.prepare(`
                SELECT COUNT(*) as count 
                FROM profiles 
                WHERE role = 'viewer'
            `).get();
            console.log(`  ${viewerCount.count} viewer users unchanged`);
            
            // Verify final state
            console.log('\nFinal role distribution:');
            const finalRoles = db.prepare(`
                SELECT role, COUNT(*) as count 
                FROM profiles 
                GROUP BY role
            `).all();
            finalRoles.forEach(r => console.log(`  ${r.role}: ${r.count}`));
            
            // Log migration in audit logs
            db.prepare(`
                INSERT INTO audit_logs (user_id, action, details, ip_address)
                VALUES (NULL, 'ROLE_MIGRATION', 'Migrated role system: admin->super_admin, user->admin', '127.0.0.1')
            `).run();
        });
        
        // Execute transaction
        transaction();
        
        console.log('\n✅ Role migration completed successfully!');
        logger.info('Role migration completed successfully');
        
    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        logger.error('Role migration failed', { error: error.message });
        throw error;
    }
}

// Run migration if called directly
if (require.main === module) {
    try {
        migrateRoles();
        process.exit(0);
    } catch (error) {
        process.exit(1);
    }
}

module.exports = { migrateRoles };
