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
 * Generate marketing message using AI - WITH FALLBACK
 * Now also generates IMAGE ads (HTML-based, downloadable)
 */
router.post('/generate', requireRestaurantAccess, async (req, res) => {
  try {
    const { type, customDetails } = req.body;
    
    const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.restaurantId);
    const menuItems = db.prepare('SELECT name, price FROM menu_items WHERE restaurant_id = ? AND is_available = 1 LIMIT 10').all(req.restaurantId);
    const deals = db.prepare('SELECT name, deal_price, original_price FROM deals WHERE restaurant_id = ? AND is_active = 1').all(req.restaurantId);
    
    // Generate text variations
    let variations = [];
    
    try {
      const ZAI = require('z-ai-web-dev-sdk').default;
      const zai = await ZAI.create();
      
      const prompt = `Generate a WhatsApp promotional message for "${restaurant.name}".
Restaurant: ${restaurant.name}
Phone: ${restaurant.phone}
Items: ${menuItems.map(m => `${m.name} (Rs. ${m.price})`).join(', ') || 'N/A'}
Deals: ${deals.map(d => `${d.name} - Rs. ${d.deal_price}`).join(', ') || 'N/A'}
Type: ${type}
Details: ${customDetails || 'None'}
Write in Roman Urdu, engaging, with emojis, under 200 chars.`;

      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: 'You are a marketing expert for Pakistani restaurants.' },
          { role: 'user', content: prompt }
        ],
        thinking: { type: 'disabled' },
        temperature: 0.8,
        max_tokens: 300
      });
      
      const msg = completion.choices[0]?.message?.content?.trim();
      if (msg) variations.push(msg);
      
      for (let i = 0; i < 2; i++) {
        const completion2 = await zai.chat.completions.create({
          messages: [
            { role: 'assistant', content: 'Create a DIFFERENT version.' },
            { role: 'user', content: prompt + `\n\nVersion ${i+2}, make it unique.` }
          ],
          thinking: { type: 'disabled' },
          temperature: 0.9,
          max_tokens: 300
        });
        const msg2 = completion2.choices[0]?.message?.content?.trim();
        if (msg2) variations.push(msg2);
      }
    } catch (aiError) {
      console.error('[Marketing] AI error:', aiError.message);
    }
    
    if (variations.length === 0) {
      variations = generateFallbackAds(restaurant, type, customDetails, menuItems, deals);
    }
    
    // Generate IMAGE ads (HTML-based, can be downloaded as PNG)
    const imageAds = generateImageAds(restaurant, type, customDetails, menuItems, deals, variations);
    
    res.json({
      success: true,
      type,
      variations,
      imageAds,
      message: `${variations.length} text + ${imageAds.length} image ads generated!`
    });
  } catch (e) {
    console.error('[Marketing] Error:', e.message);
    const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.restaurantId);
    const menuItems = db.prepare('SELECT name, price FROM menu_items WHERE restaurant_id = ? LIMIT 5').all(req.restaurantId);
    const deals = db.prepare('SELECT name, deal_price FROM deals WHERE restaurant_id = ? AND is_active = 1 LIMIT 3').all(req.restaurantId);
    
    const fallbackVariations = generateFallbackAds(restaurant, req.body.type, req.body.customDetails, menuItems, deals);
    const imageAds = generateImageAds(restaurant, req.body.type, req.body.customDetails, menuItems, deals, fallbackVariations);
    
    res.json({
      success: true,
      type: req.body.type || 'general',
      variations: fallbackVariations,
      imageAds,
      message: 'Ads generated (fallback mode)'
    });
  }
});

/**
 * Generate image ads (HTML-based, downloadable as PNG)
 */
function generateImageAds(restaurant, type, customDetails, menuItems, deals, textVariations) {
  const name = restaurant.name;
  const phone = restaurant.phone;
  const topItems = menuItems.slice(0, 3).map(m => `${m.name} - Rs. ${m.price}`).join(' | ') || 'Delicious Food';
  
  const colorSchemes = [
    { bg: '#075E54', accent: '#25D366', text: '#FFFFFF' },
    { bg: '#1a1a2e', accent: '#ff6600', text: '#FFFFFF' },
    { bg: '#fff8e1', accent: '#ff6600', text: '#333333' }
  ];
  
  const typeEmojis = {
    deal: '🔥', festival: '🌙', new_item: '🆕', discount: '💰',
    weekend_special: '🌟', anniversary: '🎂', general: '🍽️'
  };
  
  const emoji = typeEmojis[type] || '🍽️';
  
  return textVariations.slice(0, 3).map((text, i) => {
    const colors = colorSchemes[i % colorSchemes.length];
    const headline = type.replace(/_/g, ' ').toUpperCase();
    
    // Create HTML image ad (can be converted to PNG via canvas)
    const html = `
<div style="width:400px;background:${colors.bg};border-radius:20px;overflow:hidden;font-family:Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,0.3);">
  <div style="background:linear-gradient(135deg,${colors.accent},${colors.bg});padding:20px;text-align:center;">
    <div style="font-size:48px;margin-bottom:10px;">${emoji}</div>
    <h1 style="color:${colors.text};font-size:24px;margin:0;">${name}</h1>
    <p style="color:${colors.text};opacity:0.9;font-size:14px;margin:5px 0;">${headline}</p>
  </div>
  <div style="padding:20px;">
    <p style="color:${colors.text};font-size:16px;line-height:1.5;">${text.substring(0, 150)}</p>
    <div style="margin-top:15px;padding-top:15px;border-top:1px solid ${colors.accent};">
      <p style="color:${colors.accent};font-weight:bold;font-size:14px;">${topItems}</p>
    </div>
    <div style="margin-top:15px;background:${colors.accent};border-radius:10px;padding:12px;text-align:center;">
      <p style="color:#fff;font-weight:bold;font-size:18px;margin:0;">📞 ${phone}</p>
    </div>
  </div>
</div>`;
    
    return { html, text, colors, emoji };
  });
}

/**
 * Fallback ad generator - 100% works without AI
 */
function generateFallbackAds(restaurant, type, customDetails, menuItems, deals) {
  const name = restaurant.name;
  const phone = restaurant.phone;
  
  const topItems = menuItems.slice(0, 3).map(m => m.name).join(', ') || 'delicious food';
  const topDeal = deals[0];
  
  const typeMessages = {
    deal: [
      `🔥 ${name} ka Special Deal! 🎉\n${customDetails || 'Exclusive offer available now!'}\n\nOrder: ${phone}\n${topItems} 🔥`,
      `💰 Deal of the Day! ${name}\n${customDetails || 'Special discount for you!'}\n\nCall now: ${phone} 📞`,
      `🌟 ${name} - Special Deal! 🌟\n${customDetails || 'Limited time offer!'}\n\n${topItems}\nOrder: ${phone} 🛵`
    ],
    festival: [
      `🌙 Eid Mubarak from ${name}! 🎉\n${customDetails || 'Special festival menu!'}\n\nOrder: ${phone}\n${topItems} 🍽️`,
      `🎊 Festival Special! ${name}\n${customDetails || 'Celebrate with our special dishes!'}\n\n${phone} 📞`,
      `🎉 ${name} - Festival Offer!\n${customDetails || 'Festival special menu!'}\n\n${topItems}\n${phone} 🌟`
    ],
    new_item: [
      `🆕 New at ${name}! 🎉\n${customDetails || 'Try our new dish!'}\n\n${topItems}\nOrder: ${phone} 📞`,
      `✨ Just Launched! ${name}\n${customDetails || 'New menu item alert!'}\n\n${phone} 🛵`,
      `🌟 New Addition! ${name}\n${customDetails || 'Something delicious is here!'}\n\n${topItems}\n${phone} 🍽️`
    ],
    discount: [
      `💰 ${name} - Discount Offer! 🎉\n${customDetails || 'Special discount available!'}\n\nOrder: ${phone}\n${topItems} 🔥`,
      `🏷️ Special Discount! ${name}\n${customDetails || 'Save big today!'}\n\n${phone} 📞`,
      `🎉 ${name} - Discount Special!\n${customDetails || 'Limited time discount!'}\n\n${topItems}\n${phone} 💵`
    ],
    weekend_special: [
      `🌟 Weekend Special! ${name} 🎉\n${customDetails || 'Special weekend offer!'}\n\nOrder: ${phone}\n${topItems} 🔥`,
      `🎊 Weekend Deal! ${name}\n${customDetails || 'Make your weekend special!'}\n\n${phone} 📞`,
      `🌙 ${name} - Weekend Special!\n${customDetails || 'Weekend exclusive!'}\n\n${topItems}\n${phone} 🛵`
    ],
    anniversary: [
      `🎂 ${name} Anniversary! 🎉\n${customDetails || 'Celebrating with special offers!'}\n\nOrder: ${phone}\n${topItems} 🌟`,
      `🎊 Anniversary Special! ${name}\n${customDetails || 'Anniversary celebration!'}\n\n${phone} 📞`,
      `🎉 ${name} - Anniversary!\n${customDetails || 'Special anniversary menu!'}\n\n${topItems}\n${phone} 🎂`
    ],
    general: [
      `🌟 ${name} - Order Now! 🎉\n${customDetails || 'Delicious food waiting for you!'}\n\n${topItems}\nOrder: ${phone} 📞`,
      `🍽️ Hungry? ${name} is here!\n${customDetails || 'Best food in town!'}\n\n${phone} 🛵`,
      `🔥 ${name} - Best Food! 🌟\n${customDetails || 'Taste the best!'}\n\n${topItems}\n${phone} 📞`
    ]
  };
  
  return typeMessages[type] || typeMessages.general;
}

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
