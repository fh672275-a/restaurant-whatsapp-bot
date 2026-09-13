/**
 * Marketing Routes - WhatsApp Ad Generator
 * - Generate promotional WhatsApp messages per restaurant
 * - Create marketing campaigns (deals, discounts, festivals)
 * - Generate ad images (text-based promotional cards)
 * - Schedule and send broadcasts
 */

const express = require('express');
const router = express.Router();
const { db, generateId } = require('../db');

function requireRestaurantAccess(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Login required' });
  if (req.session.user.type === 'restaurant') {
    req.restaurantId = req.session.user.id;
  } else if (req.session.user.type === 'super_admin' && (req.query.restaurant_id || req.body.restaurant_id)) {
    req.restaurantId = req.query.restaurant_id || req.body.restaurant_id;
  } else {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

/**
 * Generate marketing message using AI
 * Types: deal, festival, new_item, discount, anniversary, weekend_special
 */
router.post('/generate', requireRestaurantAccess, async (req, res) => {
  try {
    const { type, customDetails } = req.body;
    
    const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.restaurantId);
    const menuItems = db.prepare('SELECT name, price FROM menu_items WHERE restaurant_id = ? AND is_available = 1 LIMIT 10').all(req.restaurantId);
    const deals = db.prepare('SELECT name, deal_price, original_price FROM deals WHERE restaurant_id = ? AND is_active = 1').all(req.restaurantId);
    
    const ZAI = require('z-ai-web-dev-sdk').default;
    const zai = await ZAI.create();
    
    const prompt = `Generate a WhatsApp promotional message for "${restaurant.name}" restaurant.

Restaurant: ${restaurant.name}
Phone: ${restaurant.phone}
Address: ${restaurant.address || 'N/A'}

Popular Items: ${menuItems.map(m => `${m.name} (Rs. ${m.price})`).join(', ') || 'N/A'}
Active Deals: ${deals.map(d => `${d.name} - Rs. ${d.deal_price}`).join(', ') || 'N/A'}

Campaign Type: ${type}
Custom Details: ${customDetails || 'None'}

Requirements:
- Write in Roman Urdu/English (Pakistani WhatsApp style)
- Make it engaging and exciting
- Use relevant emojis (3-5 max)
- Include a call to action
- Keep it under 200 characters (so it fits in WhatsApp preview)
- Make customer want to order immediately
- Include restaurant name and phone

Generate ONLY the message text, no explanations.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: 'You are a marketing expert for Pakistani restaurants. Create engaging WhatsApp promotional messages.' },
        { role: 'user', content: prompt }
      ],
      thinking: { type: 'disabled' },
      temperature: 0.8,
      max_tokens: 300
    });
    
    const message = completion.choices[0]?.message?.content?.trim();
    
    if (!message) {
      return res.status(500).json({ error: 'Failed to generate message' });
    }
    
    // Generate variations (3 different versions)
    const variations = [message];
    
    for (let i = 0; i < 2; i++) {
      const completion2 = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: 'You are a marketing expert. Create a DIFFERENT version of the promotional message. Different style, different angle.' },
          { role: 'user', content: prompt + '\n\nNote: This is version ' + (i + 2) + ', make it unique.' }
        ],
        thinking: { type: 'disabled' },
        temperature: 0.9,
        max_tokens: 300
      });
      
      const msg = completion2.choices[0]?.message?.content?.trim();
      if (msg) variations.push(msg);
    }
    
    res.json({
      success: true,
      type,
      variations,
      message: 'Generated 3 marketing message variations'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Save marketing campaign
 */
router.post('/campaigns', requireRestaurantAccess, (req, res) => {
  try {
    const { title, message, type, target_audience } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message required' });
    }
    
    const id = generateId('mkt_');
    db.prepare(`INSERT INTO marketing_campaigns 
      (id, restaurant_id, title, message, type, target_audience, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', CURRENT_TIMESTAMP)`)
      .run(id, req.restaurantId, title, message, type || 'general', target_audience || 'all');
    
    res.json({ success: true, id, message: 'Campaign saved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Get all campaigns
 */
router.get('/campaigns', requireRestaurantAccess, (req, res) => {
  const campaigns = db.prepare('SELECT * FROM marketing_campaigns WHERE restaurant_id = ? ORDER BY created_at DESC').all(req.restaurantId);
  res.json({ campaigns });
});

/**
 * Send campaign (broadcast to customers)
 */
router.post('/campaigns/:id/send', requireRestaurantAccess, async (req, res) => {
  try {
    const campaign = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ? AND restaurant_id = ?').get(req.params.id, req.restaurantId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    
    // Get target customers
    let customers;
    if (campaign.target_audience === 'vip') {
      customers = db.prepare('SELECT * FROM customers WHERE restaurant_id = ? AND total_orders >= 10').all(req.restaurantId);
    } else if (campaign.target_audience === 'recent') {
      customers = db.prepare("SELECT * FROM customers WHERE restaurant_id = ? AND last_seen >= datetime('now', '-30 days')").all(req.restaurantId);
    } else {
      customers = db.prepare('SELECT * FROM customers WHERE restaurant_id = ?').all(req.restaurantId);
    }
    
    const wa = require('../whatsapp/manager');
    let sent = 0, failed = 0;
    
    for (const customer of customers) {
      try {
        let jid = customer.phone.replace(/[^0-9]/g, '');
        if (customer.phone.startsWith('0')) {
          jid = '92' + jid.substring(1);
        }
        jid = jid + '@s.whatsapp.net';
        
        await wa.sendMessage(req.restaurantId, jid, campaign.message);
        sent++;
        await new Promise(r => setTimeout(r, 1000)); // 1 sec delay to avoid spam
      } catch (e) {
        failed++;
      }
    }
    
    db.prepare('UPDATE marketing_campaigns SET status = ?, sent_count = ?, failed_count = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('sent', sent, failed, req.params.id);
    
    res.json({
      success: true,
      sent,
      failed,
      total: customers.length,
      message: `Campaign sent to ${sent} customers!${failed > 0 ? ` ${failed} failed.` : ''}`
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Delete campaign
 */
router.delete('/campaigns/:id', requireRestaurantAccess, (req, res) => {
  db.prepare('DELETE FROM marketing_campaigns WHERE id = ? AND restaurant_id = ?').run(req.params.id, req.restaurantId);
  res.json({ success: true });
});

module.exports = router;
