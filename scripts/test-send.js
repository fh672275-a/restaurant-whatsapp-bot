/**
 * Send test message to verify bot is working
 * Sends a test message to a WhatsApp number from the connected restaurant
 */

const { db } = require('../src/db');
const wa = require('../src/whatsapp/manager');

const TEST_PHONE = process.argv[2] || '923494117212';
const TEST_MESSAGE = process.argv[3] || '🤖 Test: Bot live check!';

(async () => {
  try {
    const restaurant = db.prepare('SELECT id, name, whatsapp_phone FROM restaurants WHERE whatsapp_connected = 1').get();
    
    if (!restaurant) {
      console.log('❌ Koi restaurant connected nahi hai');
      process.exit(1);
    }
    
    console.log('Restaurant:', restaurant.name);
    console.log('WhatsApp:', restaurant.whatsapp_phone);
    console.log('Sending to:', TEST_PHONE);
    console.log('');
    
    // Wait for session to be ready
    let attempts = 0;
    while (attempts < 30) {
      const status = wa.getSessionStatus(restaurant.id);
      if (status.status === 'connected') {
        break;
      }
      console.log(`Waiting for session... (${status.status}, attempt ${attempts + 1})`);
      await new Promise(r => setTimeout(r, 1000));
      attempts++;
    }
    
    const result = await wa.sendMessage(restaurant.id, TEST_PHONE, TEST_MESSAGE);
    console.log('✅ Message sent!');
    console.log('Message ID:', result?.key?.id || 'N/A');
    
    process.exit(0);
  } catch (e) {
    console.error('❌ Failed:', e.message);
    process.exit(1);
  }
})();

