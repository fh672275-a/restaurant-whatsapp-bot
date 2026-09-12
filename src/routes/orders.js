/**
 * Order Management Routes
 * Restaurants can view, update status, and manage orders
 */

const express = require('express');
const router = express.Router();
const { db } = require('../db');
const botHandler = require('../bot/handler');

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

// List orders with filters
router.get('/', requireRestaurantAccess, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 25;
  const offset = (page - 1) * limit;
  const status = req.query.status;
  const search = req.query.search;

  let query = 'SELECT * FROM orders WHERE restaurant_id = ?';
  let params = [req.restaurantId];

  if (status && status !== 'all') {
    if (status === 'active') {
      query += " AND status IN ('new', 'confirmed', 'preparing', 'ready')";
    } else {
      query += ' AND status = ?';
      params.push(status);
    }
  }

  if (search) {
    query += ' AND (customer_phone LIKE ? OR customer_name LIKE ? OR id LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Count
  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
  const total = db.prepare(countQuery).get(...params).count;

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const orders = db.prepare(query).all(...params);
  
  // Parse items_json for each order
  orders.forEach(order => {
    order.items = JSON.parse(order.items_json);
    delete order.items_json;
  });

  res.json({
    orders,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// Get single order
router.get('/:id', requireRestaurantAccess, (req, res) => {
  const { id } = req.params;
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND restaurant_id = ?').get(id, req.restaurantId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.items = JSON.parse(order.items_json);
  delete order.items_json;
  
  // Get status history
  order.history = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at').all(id);
  
  res.json({ order });
});

// Update order status
router.post('/:id/status', requireRestaurantAccess, async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;
  const validStatuses = ['new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND restaurant_id = ?').get(id, req.restaurantId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Update via bot handler (which also notifies customer)
  await botHandler.notifyOrderStatus(req.restaurantId, id, status, reason);

  res.json({ success: true, message: `Order status updated to ${status}. Customer ko WhatsApp par notification bhej di gayi.` });
});

// Get order statistics
router.get('/stats/summary', requireRestaurantAccess, (req, res) => {
  const days = parseInt(req.query.days) || 7;
  
  const stats = {
    today: db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) as revenue,
        COUNT(CASE WHEN status = 'new' THEN 1 END) as new_orders,
        COUNT(CASE WHEN status IN ('confirmed', 'preparing') THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
      FROM orders 
      WHERE restaurant_id = ? AND date(created_at) = date('now')
    `).get(req.restaurantId),

    week: db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) as revenue
      FROM orders 
      WHERE restaurant_id = ? AND created_at >= date('now', ?)
    `).get(req.restaurantId, `-${days} days`),

    month: db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) as revenue
      FROM orders 
      WHERE restaurant_id = ? AND created_at >= date('now', 'start of month')
    `).get(req.restaurantId),

    all_time: db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) as revenue,
        COUNT(DISTINCT customer_id) as unique_customers
      FROM orders 
      WHERE restaurant_id = ?
    `).get(req.restaurantId),

    // Last 7 days breakdown
    last_7_days: db.prepare(`
      SELECT 
        date(created_at) as date,
        COUNT(*) as orders,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) as revenue
      FROM orders 
      WHERE restaurant_id = ? AND created_at >= date('now', '-7 days')
      GROUP BY date(created_at)
      ORDER BY date DESC
    `).all(req.restaurantId)
  };

  res.json({ stats });
});

// Get top selling items
router.get('/stats/top-items', requireRestaurantAccess, (req, res) => {
  const items = db.prepare(`
    SELECT 
      json_extract(value, '$.name') as name,
      SUM(json_extract(value, '$.qty')) as total_qty,
      SUM(json_extract(value, '$.qty') * json_extract(value, '$.price')) as total_revenue
    FROM orders, json_each(items_json)
    WHERE restaurant_id = ? AND status != 'cancelled'
    GROUP BY json_extract(value, '$.name')
    ORDER BY total_qty DESC
    LIMIT 10
  `).all(req.restaurantId);
  res.json({ items });
});

module.exports = router;
