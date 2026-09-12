/**
 * Restaurant Settings Routes
 * - Operating hours
 * - Delivery areas
 * - General settings (currency, tax, min order, etc)
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

// ============ GENERAL SETTINGS ============

router.get('/general', requireRestaurantAccess, (req, res) => {
  const r = db.prepare('SELECT id, name, currency, delivery_fee_default, min_order_amount, tax_percentage, logo_url, address, phone, email FROM restaurants WHERE id = ?').get(req.restaurantId);
  res.json({ restaurant: r });
});

router.put('/general', requireRestaurantAccess, (req, res) => {
  const { currency, delivery_fee_default, min_order_amount, tax_percentage, logo_url, address, phone, email } = req.body;
  const updates = [];
  const values = [];
  if (currency !== undefined) { updates.push('currency = ?'); values.push(currency); }
  if (delivery_fee_default !== undefined) { updates.push('delivery_fee_default = ?'); values.push(delivery_fee_default); }
  if (min_order_amount !== undefined) { updates.push('min_order_amount = ?'); values.push(min_order_amount); }
  if (tax_percentage !== undefined) { updates.push('tax_percentage = ?'); values.push(tax_percentage); }
  if (logo_url !== undefined) { updates.push('logo_url = ?'); values.push(logo_url); }
  if (address !== undefined) { updates.push('address = ?'); values.push(address); }
  if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
  if (email !== undefined) { updates.push('email = ?'); values.push(email); }
  if (updates.length === 0) return res.json({ success: true });
  values.push(req.restaurantId);
  db.prepare(`UPDATE restaurants SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ success: true });
});

// ============ OPERATING HOURS ============

router.get('/hours', requireRestaurantAccess, (req, res) => {
  const hours = db.prepare('SELECT * FROM operating_hours WHERE restaurant_id = ? ORDER BY day_of_week').all(req.restaurantId);
  res.json({ hours });
});

router.post('/hours', requireRestaurantAccess, (req, res) => {
  const { day_of_week, open_time, close_time, is_closed } = req.body;
  if (day_of_week === undefined) return res.status(400).json({ error: 'day_of_week required' });
  
  const existing = db.prepare('SELECT id FROM operating_hours WHERE restaurant_id = ? AND day_of_week = ?').get(req.restaurantId, day_of_week);
  
  if (existing) {
    db.prepare('UPDATE operating_hours SET open_time = ?, close_time = ?, is_closed = ? WHERE id = ?')
      .run(open_time || null, close_time || null, is_closed ? 1 : 0, existing.id);
  } else {
    const id = generateId('oh_');
    db.prepare('INSERT INTO operating_hours (id, restaurant_id, day_of_week, open_time, close_time, is_closed) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, req.restaurantId, day_of_week, open_time || null, close_time || null, is_closed ? 1 : 0);
  }
  res.json({ success: true });
});

router.post('/hours/bulk', requireRestaurantAccess, (req, res) => {
  const { hours } = req.body;
  if (!Array.isArray(hours)) return res.status(400).json({ error: 'hours array required' });
  
  const deleteStmt = db.prepare('DELETE FROM operating_hours WHERE restaurant_id = ?');
  const insertStmt = db.prepare('INSERT INTO operating_hours (id, restaurant_id, day_of_week, open_time, close_time, is_closed) VALUES (?, ?, ?, ?, ?, ?)');
  
  const txn = db.transaction(() => {
    deleteStmt.run(req.restaurantId);
    hours.forEach(h => {
      insertStmt.run(generateId('oh_'), req.restaurantId, h.day_of_week, h.open_time || null, h.close_time || null, h.is_closed ? 1 : 0);
    });
  });
  txn();
  
  res.json({ success: true });
});

// ============ DELIVERY AREAS ============

router.get('/delivery-areas', requireRestaurantAccess, (req, res) => {
  const areas = db.prepare('SELECT * FROM delivery_areas WHERE restaurant_id = ? ORDER BY delivery_fee, name').all(req.restaurantId);
  res.json({ areas });
});

router.post('/delivery-areas', requireRestaurantAccess, (req, res) => {
  const { name, delivery_fee, estimated_time, is_active } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = generateId('da_');
  db.prepare('INSERT INTO delivery_areas (id, restaurant_id, name, delivery_fee, estimated_time, is_active) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.restaurantId, name, delivery_fee || 0, estimated_time || null, is_active !== false ? 1 : 0);
  res.json({ success: true, id });
});

router.put('/delivery-areas/:id', requireRestaurantAccess, (req, res) => {
  const { id } = req.params;
  const { name, delivery_fee, estimated_time, is_active } = req.body;
  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (delivery_fee !== undefined) { updates.push('delivery_fee = ?'); values.push(delivery_fee); }
  if (estimated_time !== undefined) { updates.push('estimated_time = ?'); values.push(estimated_time); }
  if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
  if (updates.length === 0) return res.json({ success: true });
  values.push(id, req.restaurantId);
  db.prepare(`UPDATE delivery_areas SET ${updates.join(', ')} WHERE id = ? AND restaurant_id = ?`).run(...values);
  res.json({ success: true });
});

router.delete('/delivery-areas/:id', requireRestaurantAccess, (req, res) => {
  db.prepare('DELETE FROM delivery_areas WHERE id = ? AND restaurant_id = ?').run(req.params.id, req.restaurantId);
  res.json({ success: true });
});

// ============ MENU ITEM VARIATIONS ============

router.get('/items/:itemId/variations', requireRestaurantAccess, (req, res) => {
  const variations = db.prepare('SELECT * FROM menu_item_variations WHERE menu_item_id = ? ORDER BY type, is_default DESC').all(req.params.itemId);
  res.json({ variations });
});

router.post('/items/:itemId/variations', requireRestaurantAccess, (req, res) => {
  const { type, name, price_modifier, is_default } = req.body;
  if (!type || !name) return res.status(400).json({ error: 'Type and name required' });
  const id = generateId('mv_');
  db.prepare('INSERT INTO menu_item_variations (id, menu_item_id, type, name, price_modifier, is_default) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.itemId, type, name, price_modifier || 0, is_default ? 1 : 0);
  res.json({ success: true, id });
});

router.put('/variations/:id', requireRestaurantAccess, (req, res) => {
  const { id } = req.params;
  const { type, name, price_modifier, is_default, is_active } = req.body;
  const updates = [];
  const values = [];
  if (type !== undefined) { updates.push('type = ?'); values.push(type); }
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (price_modifier !== undefined) { updates.push('price_modifier = ?'); values.push(price_modifier); }
  if (is_default !== undefined) { updates.push('is_default = ?'); values.push(is_default ? 1 : 0); }
  if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
  if (updates.length === 0) return res.json({ success: true });
  values.push(id);
  db.prepare(`UPDATE menu_item_variations SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ success: true });
});

router.delete('/variations/:id', requireRestaurantAccess, (req, res) => {
  db.prepare('DELETE FROM menu_item_variations WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ FEEDBACK ============

router.get('/feedback', requireRestaurantAccess, (req, res) => {
  const feedback = db.prepare(`
    SELECT cf.*, o.customer_name, o.total as order_total
    FROM customer_feedback cf
    LEFT JOIN orders o ON cf.order_id = o.id
    WHERE cf.restaurant_id = ?
    ORDER BY cf.created_at DESC
  `).all(req.restaurantId);
  
  const avg = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM customer_feedback WHERE restaurant_id = ?').get(req.restaurantId);
  
  res.json({ feedback, stats: { avg_rating: avg.avg || 0, total: avg.count } });
});

router.delete('/feedback/:id', requireRestaurantAccess, (req, res) => {
  db.prepare('DELETE FROM customer_feedback WHERE id = ? AND restaurant_id = ?').run(req.params.id, req.restaurantId);
  res.json({ success: true });
});

// ============ BROADCASTS ============

router.get('/broadcasts', requireRestaurantAccess, (req, res) => {
  const broadcasts = db.prepare('SELECT * FROM broadcasts WHERE restaurant_id = ? ORDER BY created_at DESC').all(req.restaurantId);
  res.json({ broadcasts });
});

router.post('/broadcasts', requireRestaurantAccess, (req, res) => {
  const { title, message, target_audience, scheduled_at } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message required' });
  const id = generateId('bc_');
  db.prepare('INSERT INTO broadcasts (id, restaurant_id, title, message, target_audience, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.restaurantId, title, message, target_audience || 'all', scheduled_at || null, scheduled_at ? 'scheduled' : 'draft');
  res.json({ success: true, id });
});

router.post('/broadcasts/:id/send', requireRestaurantAccess, async (req, res) => {
  const { id } = req.params;
  const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ? AND restaurant_id = ?').get(id, req.restaurantId);
  if (!broadcast) return res.status(404).json({ error: 'Broadcast not found' });
  
  // Get target customers
  let customers;
  if (broadcast.target_audience === 'vip') {
    customers = db.prepare('SELECT * FROM customers WHERE restaurant_id = ? AND total_orders >= 10').all(req.restaurantId);
  } else if (broadcast.target_audience === 'recent') {
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
      
      await wa.sendMessage(req.restaurantId, jid, broadcast.message);
      sent++;
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      failed++;
    }
  }
  
  db.prepare('UPDATE broadcasts SET status = ?, sent_count = ?, failed_count = ?, sent_at = datetime("now") WHERE id = ?')
    .run('sent', sent, failed, id);
  
  res.json({ success: true, sent, failed, total: customers.length });
});

router.delete('/broadcasts/:id', requireRestaurantAccess, (req, res) => {
  db.prepare('DELETE FROM broadcasts WHERE id = ? AND restaurant_id = ?').run(req.params.id, req.restaurantId);
  res.json({ success: true });
});

// ============ RESERVATIONS ============

router.get('/reservations', requireRestaurantAccess, (req, res) => {
  const reservations = db.prepare('SELECT * FROM reservations WHERE restaurant_id = ? ORDER BY reservation_date, reservation_time').all(req.restaurantId);
  res.json({ reservations });
});

router.post('/reservations/:id/status', requireRestaurantAccess, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  db.prepare('UPDATE reservations SET status = ? WHERE id = ? AND restaurant_id = ?').run(status, id, req.restaurantId);
  res.json({ success: true });
});

router.delete('/reservations/:id', requireRestaurantAccess, (req, res) => {
  db.prepare('DELETE FROM reservations WHERE id = ? AND restaurant_id = ?').run(req.params.id, req.restaurantId);
  res.json({ success: true });
});

// ============ ANALYTICS ============

router.get('/analytics', requireRestaurantAccess, (req, res) => {
  const days = parseInt(req.query.days) || 30;
  
  const analytics = {
    // Order stats
    orders: db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN status IN ('new', 'confirmed', 'preparing', 'ready') THEN 1 END) as active,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) as revenue,
        COALESCE(AVG(CASE WHEN status != 'cancelled' THEN total ELSE NULL END), 0) as avg_order_value
      FROM orders 
      WHERE restaurant_id = ? AND created_at >= date('now', ?)
    `).get(req.restaurantId, `-${days} days`),
    
    // Top items
    top_items: db.prepare(`
      SELECT 
        json_extract(value, '$.name') as name,
        SUM(json_extract(value, '$.qty')) as qty,
        SUM(json_extract(value, '$.qty') * json_extract(value, '$.price')) as revenue
      FROM orders, json_each(items_json)
      WHERE restaurant_id = ? AND status != 'cancelled' AND created_at >= date('now', ?)
      GROUP BY json_extract(value, '$.name')
      ORDER BY qty DESC LIMIT 10
    `).all(req.restaurantId, `-${days} days`),
    
    // Daily breakdown
    daily: db.prepare(`
      SELECT 
        date(created_at) as date,
        COUNT(*) as orders,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) as revenue
      FROM orders 
      WHERE restaurant_id = ? AND created_at >= date('now', ?)
      GROUP BY date(created_at)
      ORDER BY date DESC
    `).all(req.restaurantId, `-${days} days`),
    
    // Customer stats
    customers: db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN last_seen >= datetime('now', '-7 days') THEN 1 END) as active_week,
        COUNT(CASE WHEN last_seen >= datetime('now', '-30 days') THEN 1 END) as active_month,
        COUNT(CASE WHEN total_orders >= 10 THEN 1 END) as vip
      FROM customers WHERE restaurant_id = ?
    `).get(req.restaurantId),
    
    // Hourly distribution (busy hours)
    hourly: db.prepare(`
      SELECT 
        CAST(strftime('%H', created_at) AS INTEGER) as hour,
        COUNT(*) as orders
      FROM orders 
      WHERE restaurant_id = ? AND created_at >= date('now', ?)
      GROUP BY hour ORDER BY hour
    `).all(req.restaurantId, `-${days} days`),
    
    // Feedback stats
    feedback: db.prepare(`
      SELECT 
        AVG(rating) as avg_rating,
        COUNT(*) as total,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
        COUNT(CASE WHEN rating <= 2 THEN 1 END) as negative
      FROM customer_feedback WHERE restaurant_id = ?
    `).get(req.restaurantId)
  };
  
  res.json({ analytics });
});

module.exports = router;
