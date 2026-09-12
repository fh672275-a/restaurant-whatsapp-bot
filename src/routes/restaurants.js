/**
 * Restaurant Management Routes
 * Super admin can create/manage restaurants
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { db, generateId } = require('../db');
const waManager = require('../whatsapp/manager');

// Middleware: super admin only
function requireSuperAdmin(req, res, next) {
  if (!req.session.user || req.session.user.type !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

// Middleware: authenticated (restaurant or admin)
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Login required' });
  }
  next();
}

// List all restaurants (super admin)
router.get('/', requireSuperAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  let query = 'SELECT id, name, owner_name, phone, email, address, whatsapp_connected, whatsapp_phone, is_active, created_at FROM restaurants';
  let params = [];
  if (search) {
    query += ' WHERE name LIKE ? OR phone LIKE ? OR whatsapp_phone LIKE ?';
    params = [`%${search}%`, `%${search}%`, `%${search}%`];
  }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const restaurants = db.prepare(query).all(...params);
  
  let countQuery = 'SELECT COUNT(*) as total FROM restaurants';
  if (search) {
    countQuery += ' WHERE name LIKE ? OR phone LIKE ? OR whatsapp_phone LIKE ?';
  }
  const total = db.prepare(countQuery).get(...(search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [])).total;

  res.json({
    restaurants,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// Get single restaurant
router.get('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  // Super admin can see any; restaurant can only see own
  if (req.session.user.type === 'restaurant' && req.session.user.id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const restaurant = db.prepare('SELECT id, name, owner_name, phone, email, address, whatsapp_connected, whatsapp_phone, is_active, created_at FROM restaurants WHERE id = ?').get(id);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
  
  // Get stats
  const stats = {
    total_orders: db.prepare('SELECT COUNT(*) as count FROM orders WHERE restaurant_id = ?').get(id).count,
    pending_orders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE restaurant_id = ? AND status IN ('new', 'confirmed', 'preparing')").get(id).count,
    total_customers: db.prepare('SELECT COUNT(*) as count FROM customers WHERE restaurant_id = ?').get(id).count,
    total_revenue: db.prepare("SELECT COALESCE(SUM(total), 0) as sum FROM orders WHERE restaurant_id = ? AND status != 'cancelled'").get(id).sum,
    today_orders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE restaurant_id = ? AND date(created_at) = date('now')").get(id).count
  };

  // Get WhatsApp status
  const waStatus = waManager.getSessionStatus(id);

  res.json({ restaurant, stats, whatsapp: waStatus });
});

// Create new restaurant (super admin)
router.post('/', requireSuperAdmin, (req, res) => {
  const { name, owner_name, phone, email, address, password } = req.body;
  if (!name || !phone || !password) {
    return res.status(400).json({ error: 'Name, phone aur password zaruri hain' });
  }
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  // Check if phone already registered
  const existing = db.prepare('SELECT id FROM restaurants WHERE phone = ?').get(cleanPhone);
  if (existing) {
    return res.status(400).json({ error: 'Yeh phone pehle se register hai' });
  }
  const id = generateId('rest_');
  const hashedPassword = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO restaurants (id, name, owner_name, phone, email, address, password) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, owner_name || null, cleanPhone, email || null, address || null, hashedPassword);
  
  res.json({ success: true, id, message: 'Restaurant create ho gaya' });
});

// Update restaurant
router.put('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  if (req.session.user.type === 'restaurant' && req.session.user.id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { name, owner_name, email, address, is_active } = req.body;
  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (owner_name !== undefined) { updates.push('owner_name = ?'); values.push(owner_name); }
  if (email !== undefined) { updates.push('email = ?'); values.push(email); }
  if (address !== undefined) { updates.push('address = ?'); values.push(address); }
  if (req.session.user.type === 'super_admin' && is_active !== undefined) {
    updates.push('is_active = ?'); values.push(is_active ? 1 : 0);
  }
  if (updates.length === 0) {
    return res.json({ success: true, message: 'No changes' });
  }
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  db.prepare(`UPDATE restaurants SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ success: true });
});

// Delete restaurant (super admin only)
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  // Disconnect WhatsApp first
  try {
    await waManager.disconnectSession(id);
  } catch (e) {
    // ignore
  }
  db.prepare('DELETE FROM restaurants WHERE id = ?').run(id);
  res.json({ success: true });
});

// Change password
router.post('/:id/change-password', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (req.session.user.type === 'restaurant' && req.session.user.id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current aur new password zaruri hain' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password kam az kam 6 characters ka ho' });
  }
  const restaurant = db.prepare('SELECT password FROM restaurants WHERE id = ?').get(id);
  if (!restaurant || !bcrypt.compareSync(current_password, restaurant.password)) {
    return res.status(401).json({ error: 'Galat current password' });
  }
  const hashedPassword = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE restaurants SET password = ? WHERE id = ?').run(hashedPassword, id);
  res.json({ success: true });
});

module.exports = router;
