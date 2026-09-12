/**
 * WhatsApp Connection Routes
 * - Generate QR code for connecting WhatsApp
 * - Get connection status
 * - Disconnect/reconnect sessions
 */

const express = require('express');
const router = express.Router();
const waManager = require('../whatsapp/manager');
const { db } = require('../db');

// Middleware: restaurant access
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

// Start WhatsApp session & get QR code
router.post('/connect', requireRestaurantAccess, async (req, res) => {
  const result = await waManager.startSession(req.restaurantId);
  res.json(result);
});

// Get current session status
router.get('/status', requireRestaurantAccess, (req, res) => {
  const status = waManager.getSessionStatus(req.restaurantId);
  res.json(status);
});

// Disconnect WhatsApp
router.post('/disconnect', requireRestaurantAccess, async (req, res) => {
  await waManager.disconnectSession(req.restaurantId);
  res.json({ success: true, message: 'WhatsApp disconnected' });
});

// Clear session & restart
router.post('/reconnect', requireRestaurantAccess, async (req, res) => {
  // Don't clear session, just restart it
  const result = await waManager.startSession(req.restaurantId);
  res.json(result);
});

// Send test message (admin can send to any restaurant)
router.post('/test-message', async (req, res) => {
  // Allow both super admin and restaurant
  if (!req.session.user) {
    return res.status(401).json({ error: 'Login required' });
  }
  
  let restaurantId;
  if (req.session.user.type === 'restaurant') {
    restaurantId = req.session.user.id;
  } else if (req.session.user.type === 'super_admin') {
    restaurantId = req.query.restaurant_id || req.body.restaurant_id;
    if (!restaurantId) {
      // Use first connected restaurant
      const connected = db.prepare('SELECT id FROM restaurants WHERE whatsapp_connected = 1 LIMIT 1').get();
      if (!connected) {
        return res.status(400).json({ error: 'No connected restaurant found' });
      }
      restaurantId = connected.id;
    }
  } else {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'Phone aur message zaruri hain' });
  }
  try {
    const result = await waManager.sendMessage(restaurantId, phone, message);
    res.json({ success: true, messageId: result?.key?.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get all connected sessions (super admin only)
router.get('/sessions/all', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin only' });
  }
  const restaurants = db.prepare('SELECT id, name, whatsapp_connected, whatsapp_phone FROM restaurants').all();
  const result = restaurants.map(r => {
    const status = waManager.getSessionStatus(r.id);
    return {
      restaurant_id: r.id,
      restaurant_name: r.name,
      db_connected: r.whatsapp_connected === 1,
      db_phone: r.whatsapp_phone,
      session_status: status.status,
      session_phone: status.phone
    };
  });
  res.json({ sessions: result });
});

module.exports = router;
