/**
 * Admin Panel Routes - Separate from restaurant login
 * 
 * Access: /admin-panel
 * Code: Joai5663@@
 * 
 * Features:
 * - View ALL restaurants (customers)
 * - View ALL payments
 * - Verify/Reject payments
 * - View ALL subscriptions
 * - View ALL orders across all restaurants
 * - View analytics
 * - Manage restaurants (activate/deactivate)
 */

const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { ADMIN_ACCESS_CODE } = require('../config/pricing');

// ============ MIDDLEWARE: ADMIN CODE VERIFICATION ============

function requireAdminCode(req, res, next) {
  // Check session first
  if (req.session.adminPanel && req.session.adminPanel.code === ADMIN_ACCESS_CODE) {
    return next();
  }
  
  // Check header (for API calls)
  const adminCode = req.headers['x-admin-code'] || req.body.adminCode;
  if (adminCode === ADMIN_ACCESS_CODE) {
    req.session.adminPanel = { code: ADMIN_ACCESS_CODE, loginAt: Date.now() };
    return next();
  }
  
  return res.status(403).json({ error: 'Invalid admin code' });
}

// ============ ADMIN PANEL LOGIN PAGE ============
router.get('/', (req, res) => {
  if (req.session.adminPanel) {
    return res.redirect('/admin-panel/dashboard');
  }
  res.render('admin-panel-login');
});

// ============ ADMIN PANEL LOGIN (POST) ============
router.post('/login', (req, res) => {
  const { code } = req.body;
  
  if (code !== ADMIN_ACCESS_CODE) {
    return res.status(403).json({ error: 'Galat code! Access denied.' });
  }
  
  req.session.adminPanel = {
    code: ADMIN_ACCESS_CODE,
    loginAt: Date.now(),
    ip: req.ip
  };
  
  console.log('[Admin Panel] Login successful from IP:', req.ip);
  res.json({ success: true, redirect: '/admin-panel/dashboard' });
});

// ============ ADMIN PANEL DASHBOARD ============
router.get('/dashboard', requireAdminCode, (req, res) => {
  res.render('admin-panel-dashboard');
});

// ============ API: GET ALL RESTAURANTS (CUSTOMERS) ============
router.get('/api/restaurants', requireAdminCode, (req, res) => {
  try {
    const restaurants = db.prepare(`
      SELECT r.id, r.name, r.owner_name, r.phone, r.email, r.address, 
             r.whatsapp_connected, r.whatsapp_phone, r.is_active, 
             r.subscription_plan, r.created_at,
             (SELECT COUNT(*) FROM orders WHERE restaurant_id = r.id) as total_orders,
             (SELECT COUNT(*) FROM customers WHERE restaurant_id = r.id) as total_customers,
             (SELECT COALESCE(SUM(total), 0) FROM orders WHERE restaurant_id = r.id AND status != 'cancelled') as total_revenue
      FROM restaurants r
      ORDER BY r.created_at DESC
    `).all();
    
    res.json({ restaurants, total: restaurants.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ API: GET ALL PAYMENTS ============
router.get('/api/payments', requireAdminCode, (req, res) => {
  try {
    const payments = db.prepare(`
      SELECT p.*, r.name as restaurant_name, r.phone as restaurant_phone
      FROM payments p
      LEFT JOIN restaurants r ON p.restaurant_id = r.id
      ORDER BY p.created_at DESC
    `).all();
    
    res.json({ payments, total: payments.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ API: VERIFY PAYMENT ============
router.post('/api/payments/:id/verify', requireAdminCode, (req, res) => {
  try {
    const { id } = req.params;
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    
    db.prepare('UPDATE payments SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('paid', id);
    
    // Activate subscription
    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + 1);
    
    db.prepare('UPDATE subscriptions SET status = ? WHERE restaurant_id = ? AND status = ?')
      .run('cancelled', payment.restaurant_id, 'active');
    
    db.prepare(`INSERT INTO subscriptions 
      (id, restaurant_id, plan_id, payment_id, status, trial, valid_from, valid_until)
      VALUES (?, ?, ?, ?, 'active', 0, CURRENT_TIMESTAMP, ?)`)
      .run(
        require('nanoid').nanoid(12),
        payment.restaurant_id,
        payment.plan_id,
        id,
        validUntil.toISOString()
      );
    
    db.prepare('UPDATE restaurants SET subscription_plan = ? WHERE id = ?')
      .run(payment.plan_id, payment.restaurant_id);
    
    console.log('[Admin Panel] Payment verified:', id);
    res.json({ success: true, message: 'Payment verified, plan activated!' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ API: REJECT PAYMENT ============
router.post('/api/payments/:id/reject', requireAdminCode, (req, res) => {
  try {
    const { reason } = req.body;
    db.prepare('UPDATE payments SET status = ?, notes = ? WHERE id = ?')
      .run('rejected', reason || 'Invalid payment', req.params.id);
    
    res.json({ success: true, message: 'Payment rejected' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ API: GET ALL SUBSCRIPTIONS ============
router.get('/api/subscriptions', requireAdminCode, (req, res) => {
  try {
    const subs = db.prepare(`
      SELECT s.*, r.name as restaurant_name, r.phone as restaurant_phone
      FROM subscriptions s
      LEFT JOIN restaurants r ON s.restaurant_id = r.id
      ORDER BY s.created_at DESC
    `).all();
    
    res.json({ subscriptions: subs, total: subs.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ API: GET ALL ORDERS ============
router.get('/api/orders', requireAdminCode, (req, res) => {
  try {
    const orders = db.prepare(`
      SELECT o.*, r.name as restaurant_name
      FROM orders o
      LEFT JOIN restaurants r ON o.restaurant_id = r.id
      ORDER BY o.created_at DESC
      LIMIT 100
    `).all();
    
    res.json({ orders, total: orders.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ API: ACTIVATE/DEACTIVATE RESTAURANT ============
router.post('/api/restaurants/:id/toggle', requireAdminCode, (req, res) => {
  try {
    const restaurant = db.prepare('SELECT is_active FROM restaurants WHERE id = ?').get(req.params.id);
    if (!restaurant) return res.status(404).json({ error: 'Not found' });
    
    const newStatus = restaurant.is_active ? 0 : 1;
    db.prepare('UPDATE restaurants SET is_active = ? WHERE id = ?').run(newStatus, req.params.id);
    
    res.json({ success: true, is_active: newStatus });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ API: DELETE RESTAURANT ============
router.delete('/api/restaurants/:id', requireAdminCode, (req, res) => {
  try {
    db.prepare('DELETE FROM restaurants WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Restaurant deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ API: GET ANALYTICS ============
router.get('/api/analytics', requireAdminCode, (req, res) => {
  try {
    const stats = {
      totalRestaurants: db.prepare('SELECT COUNT(*) as c FROM restaurants').get().c,
      activeRestaurants: db.prepare('SELECT COUNT(*) as c FROM restaurants WHERE is_active = 1').get().c,
      whatsappConnected: db.prepare('SELECT COUNT(*) as c FROM restaurants WHERE whatsapp_connected = 1').get().c,
      totalOrders: db.prepare('SELECT COUNT(*) as c FROM orders').get().c,
      totalRevenue: db.prepare("SELECT COALESCE(SUM(total), 0) as s FROM orders WHERE status != 'cancelled'").get().s,
      pendingPayments: db.prepare("SELECT COUNT(*) as c FROM payments WHERE status = 'pending' OR status = 'verification_pending'").get().c,
      verifiedPayments: db.prepare("SELECT COUNT(*) as c FROM payments WHERE status = 'paid'").get().c,
      activeSubscriptions: db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active'").get().c,
      totalCustomers: db.prepare('SELECT COUNT(*) as c FROM customers').get().c
    };
    
    // Plan distribution
    const planDist = db.prepare(`
      SELECT subscription_plan, COUNT(*) as count 
      FROM restaurants 
      WHERE subscription_plan IS NOT NULL 
      GROUP BY subscription_plan
    `).all();
    
    res.json({ stats, planDistribution: planDist });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ LOGOUT ============
router.post('/logout', (req, res) => {
  req.session.adminPanel = null;
  res.json({ success: true, redirect: '/admin-panel' });
});

module.exports = router;
