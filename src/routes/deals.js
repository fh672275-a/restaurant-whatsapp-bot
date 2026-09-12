/**
 * Deals Management Routes
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

// Get all deals
router.get('/', requireRestaurantAccess, (req, res) => {
  const deals = db.prepare('SELECT * FROM deals WHERE restaurant_id = ? ORDER BY sort_order, created_at DESC').all(req.restaurantId);
  
  // Get deal items for each deal
  const dealsWithItems = deals.map(deal => {
    const items = db.prepare(`
      SELECT di.*, mi.name as item_name 
      FROM deal_items di 
      LEFT JOIN menu_items mi ON di.menu_item_id = mi.id 
      WHERE di.deal_id = ?
    `).all(deal.id);
    return { ...deal, items };
  });
  
  res.json({ deals: dealsWithItems });
});

// Create deal
router.post('/', requireRestaurantAccess, (req, res) => {
  const { name, description, original_price, deal_price, valid_from, valid_until, items } = req.body;
  if (!name || deal_price === undefined) {
    return res.status(400).json({ error: 'Name aur deal price zaruri hain' });
  }
  const id = generateId('deal_');
  db.prepare(`INSERT INTO deals 
    (id, restaurant_id, name, description, original_price, deal_price, valid_from, valid_until)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, req.restaurantId, name, description || null,
    original_price || null, deal_price, valid_from || null, valid_until || null
  );
  
  // Add deal items
  if (items && Array.isArray(items)) {
    items.forEach(item => {
      const itemId = generateId('di_');
      db.prepare('INSERT INTO deal_items (id, deal_id, menu_item_id, custom_name, quantity) VALUES (?, ?, ?, ?, ?)')
        .run(itemId, id, item.menu_item_id || null, item.custom_name || null, item.quantity || 1);
    });
  }
  
  res.json({ success: true, id });
});

// Update deal
router.put('/:id', requireRestaurantAccess, (req, res) => {
  const { id } = req.params;
  const { name, description, original_price, deal_price, is_active, sort_order, valid_from, valid_until } = req.body;
  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }
  if (original_price !== undefined) { updates.push('original_price = ?'); values.push(original_price); }
  if (deal_price !== undefined) { updates.push('deal_price = ?'); values.push(deal_price); }
  if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
  if (valid_from !== undefined) { updates.push('valid_from = ?'); values.push(valid_from); }
  if (valid_until !== undefined) { updates.push('valid_until = ?'); values.push(valid_until); }
  if (updates.length === 0) return res.json({ success: true });
  values.push(id, req.restaurantId);
  db.prepare(`UPDATE deals SET ${updates.join(', ')} WHERE id = ? AND restaurant_id = ?`).run(...values);
  res.json({ success: true });
});

// Delete deal
router.delete('/:id', requireRestaurantAccess, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM deals WHERE id = ? AND restaurant_id = ?').run(id, req.restaurantId);
  res.json({ success: true });
});

// Add deal item
router.post('/:id/items', requireRestaurantAccess, (req, res) => {
  const { id } = req.params;
  const { menu_item_id, custom_name, quantity } = req.body;
  const itemId = generateId('di_');
  db.prepare('INSERT INTO deal_items (id, deal_id, menu_item_id, custom_name, quantity) VALUES (?, ?, ?, ?, ?)')
    .run(itemId, id, menu_item_id || null, custom_name || null, quantity || 1);
  res.json({ success: true, id: itemId });
});

// Remove deal item
router.delete('/:id/items/:itemId', requireRestaurantAccess, (req, res) => {
  db.prepare('DELETE FROM deal_items WHERE id = ? AND deal_id = ?').run(req.params.itemId, req.params.id);
  res.json({ success: true });
});

module.exports = router;
