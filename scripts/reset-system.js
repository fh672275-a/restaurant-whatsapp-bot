/**
 * Reset System - Delete all data except super admin
 * 
 * Deletes:
 * - All restaurants (and cascades to their data)
 * - All customers, orders, menu items, deals, etc.
 * - All WhatsApp sessions
 * - All conversation history
 * 
 * Keeps:
 * - Super admin account (admin/admin123)
 * - Database schema (all tables)
 */

const { db } = require('../src/db');
const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('  SYSTEM RESET - Fresh Start');
console.log('========================================\n');

// Confirm
if (!process.argv.includes('--confirm')) {
  console.log('⚠️  Yeh action SAB data delete kar dega!');
  console.log('Run karein: node scripts/reset-system.js --confirm');
  process.exit(0);
}

try {
  console.log('Deleting all data...\n');
  
  // Order matters due to foreign keys
  // Delete child tables first, then parent tables
  
  const tables = [
    'order_status_history',
    'orders',
    'bot_conversations',
    'customer_feedback',
    'deal_items',
    'deals',
    'delivery_areas',
    'operating_hours',
    'broadcasts',
    'marketing_campaigns',
    'menu_item_variations',
    'menu_items',
    'menu_categories',
    'reservations',
    'customers',
    'restaurants'
  ];
  
  for (const table of tables) {
    try {
      const result = db.prepare(`DELETE FROM ${table}`).run();
      console.log(`  ✅ ${table}: ${result.changes} rows deleted`);
    } catch (e) {
      console.log(`  ⚠️  ${table}: ${e.message}`);
    }
  }
  
  // Delete WhatsApp session files
  const sessionsDir = path.join(__dirname, '..', 'data', 'whatsapp_sessions');
  if (fs.existsSync(sessionsDir)) {
    const dirs = fs.readdirSync(sessionsDir);
    for (const dir of dirs) {
      const dirPath = path.join(sessionsDir, dir);
      if (fs.statSync(dirPath).isDirectory()) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`  ✅ Deleted WhatsApp session: ${dir}`);
      }
    }
  }
  
  // Delete uploads (logos)
  const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
  if (fs.existsSync(uploadsDir)) {
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    console.log('  ✅ Deleted uploads directory');
  }
  
  // Vacuum database (reclaim space)
  db.pragma('vacuum');
  console.log('\n  ✅ Database vacuumed');
  
  console.log('\n========================================');
  console.log('  ✅ System Reset Complete!');
  console.log('========================================');
  console.log('\nSuper Admin (preserved):');
  console.log('  Username: admin');
  console.log('  Password: admin123');
  console.log('\nSystem is now FRESH - no restaurants, no data.');
  console.log('Naya restaurant signup karein: /signup');
  
} catch (e) {
  console.error('❌ Error:', e.message);
}
