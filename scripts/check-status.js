/**
 * Check WhatsApp connection status
 */

const { db } = require('../src/db');
const wa = require('../src/whatsapp/manager');

(async () => {
  try {
    const restaurants = db.prepare('SELECT id, name, whatsapp_connected, whatsapp_phone FROM restaurants').all();
    
    if (restaurants.length === 0) {
      console.log('❌ Koi restaurant register nahi hai');
      return;
    }
    
    console.log('========================================');
    console.log('  WhatsApp Connection Status');
    console.log('========================================\n');
    
    for (const r of restaurants) {
      console.log('Restaurant:', r.name);
      console.log('  WhatsApp Number:', r.whatsapp_phone || 'N/A');
      console.log('  DB Status:', r.whatsapp_connected ? '✅ Connected' : '❌ Not Connected');
      const status = wa.getSessionStatus(r.id);
      console.log('  Live Session:', status.status);
      if (status.phone) console.log('  Active as:', status.phone);
      console.log('');
    }
    
    console.log('========================================');
    console.log('  Server: Running on port 3000');
    console.log('  Dashboard: http://localhost:3000');
    console.log('  WhatsApp: 24/7 active (owner offline ho tab bhi)');
    console.log('========================================\n');
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
