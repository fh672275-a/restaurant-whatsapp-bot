/**
 * Disconnect WhatsApp bot from a restaurant
 * Removes the session and clears all auth files
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database('/home/z/my-project/data/app.db');

(async () => {
  try {
    // Get all connected restaurants
    const restaurants = db.prepare('SELECT id, name, whatsapp_phone FROM restaurants WHERE whatsapp_connected = 1').all();
    
    if (restaurants.length === 0) {
      console.log('ℹ️  Koi WhatsApp connected nahi hai');
      process.exit(0);
    }
    
    console.log('=== Disconnecting WhatsApp Sessions ===\n');
    
    for (const r of restaurants) {
      console.log(`Restaurant: ${r.name}`);
      console.log(`  WhatsApp: ${r.whatsapp_phone}`);
      
      // Update DB - mark as disconnected
      db.prepare('UPDATE restaurants SET whatsapp_connected = 0, whatsapp_phone = NULL WHERE id = ?').run(r.id);
      console.log('  ✅ DB updated - marked disconnected');
      
      // Delete session files
      const sessionDir = path.join('/home/z/my-project/data/whatsapp_sessions', r.id);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log('  ✅ Session files deleted');
      }
    }
    
    console.log('\n=== WhatsApp Bot Disconnected Successfully ===');
    console.log('');
    console.log('⚠️  IMPORTANT: Apne phone par WhatsApp open karein');
    console.log('   Settings → Linked Devices → "Faheem Haider" ya jo bhi name hai usay DELETE karein');
    console.log('   Taake properly disconnect ho jaye');
    
    db.close();
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    db.close();
    process.exit(1);
  }
})();
