/**
 * Menu Management Routes
 * Restaurants can manage their menu items and categories
 */

const express = require('express');
const router = express.Router();
const { db, generateId } = require('../db');

// Middleware: restaurant access
function requireRestaurantAccess(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Login required' });
  if (req.session.user.type === 'restaurant') {
    req.restaurantId = req.session.user.id;
  } else if (req.session.user.type === 'super_admin' && req.query.restaurant_id) {
    req.restaurantId = req.query.restaurant_id;
  } else {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

// Get all categories
router.get('/categories', requireRestaurantAccess, (req, res) => {
  const categories = db.prepare('SELECT * FROM menu_categories WHERE restaurant_id = ? ORDER BY sort_order, name').all(req.restaurantId);
  res.json({ categories });
});

// Create category
router.post('/categories', requireRestaurantAccess, (req, res) => {
  const { name, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name zaruri hai' });
  const id = generateId('cat_');
  db.prepare('INSERT INTO menu_categories (id, restaurant_id, name, sort_order) VALUES (?, ?, ?, ?)')
    .run(id, req.restaurantId, name, sort_order || 0);
  res.json({ success: true, id });
});

// Update category
router.put('/categories/:id', requireRestaurantAccess, (req, res) => {
  const { id } = req.params;
  const { name, sort_order, is_active } = req.body;
  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
  if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
  if (updates.length === 0) return res.json({ success: true });
  values.push(id, req.restaurantId);
  db.prepare(`UPDATE menu_categories SET ${updates.join(', ')} WHERE id = ? AND restaurant_id = ?`).run(...values);
  res.json({ success: true });
});

// Delete category
router.delete('/categories/:id', requireRestaurantAccess, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM menu_categories WHERE id = ? AND restaurant_id = ?').run(id, req.restaurantId);
  res.json({ success: true });
});

// Get all menu items
router.get('/items', requireRestaurantAccess, (req, res) => {
  const items = db.prepare(`
    SELECT mi.*, mc.name as category_name 
    FROM menu_items mi 
    LEFT JOIN menu_categories mc ON mi.category_id = mc.id 
    WHERE mi.restaurant_id = ? 
    ORDER BY mi.sort_order, mi.name
  `).all(req.restaurantId);
  res.json({ items });
});

// Create menu item
router.post('/items', requireRestaurantAccess, (req, res) => {
  const { name, description, price, category_id, is_available, sort_order } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'Name aur price zaruri hain' });
  if (price < 0) return res.status(400).json({ error: 'Price 0 ya is se zyada honi chahiye' });
  const id = generateId('item_');
  db.prepare('INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price, is_available, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.restaurantId, category_id || null, name, description || null, price, is_available === false ? 0 : 1, sort_order || 0);
  res.json({ success: true, id });
});

// Update menu item
router.put('/items/:id', requireRestaurantAccess, (req, res) => {
  const { id } = req.params;
  const { name, description, price, category_id, is_available, sort_order } = req.body;
  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }
  if (price !== undefined) { updates.push('price = ?'); values.push(price); }
  if (category_id !== undefined) { updates.push('category_id = ?'); values.push(category_id); }
  if (is_available !== undefined) { updates.push('is_available = ?'); values.push(is_available ? 1 : 0); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
  if (updates.length === 0) return res.json({ success: true });
  values.push(id, req.restaurantId);
  db.prepare(`UPDATE menu_items SET ${updates.join(', ')} WHERE id = ? AND restaurant_id = ?`).run(...values);
  res.json({ success: true });
});

// Delete menu item
router.delete('/items/:id', requireRestaurantAccess, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM menu_items WHERE id = ? AND restaurant_id = ?').run(id, req.restaurantId);
  res.json({ success: true });
});

// Bulk seed sample menu (for quick setup)
router.post('/seed-sample', requireRestaurantAccess, (req, res) => {
  // Check if menu already has items
  const existing = db.prepare('SELECT COUNT(*) as count FROM menu_items WHERE restaurant_id = ?').get(req.restaurantId);
  if (existing.count > 0) {
    return res.status(400).json({ error: 'Menu already has items. Delete them first.' });
  }

  // Create categories
  const categories = [
    { name: 'Burgers', items: [
      { name: 'Zinger Burger', desc: 'Crispy chicken fillet, fresh veggies, special sauce', price: 350 },
      { name: 'Beef Burger', desc: 'Juicy beef patty, cheese, lettuce, tomato', price: 450 },
      { name: 'Chicken Cheese Burger', desc: 'Grilled chicken, double cheese', price: 400 },
      { name: 'Veggie Burger', desc: 'Plant-based patty, fresh vegetables', price: 300 }
    ]},
    { name: 'Pizza', items: [
      { name: 'Chicken Tikka Pizza (Small)', desc: '8 inch, serves 1-2', price: 600 },
      { name: 'Chicken Tikka Pizza (Large)', desc: '12 inch, serves 3-4', price: 1100 },
      { name: 'Pepperoni Pizza (Large)', desc: '12 inch, extra pepperoni', price: 1200 },
      { name: 'Fajita Pizza (Large)', desc: '12 inch, chicken fajita style', price: 1150 }
    ]},
    { name: 'Biryani & Rice', items: [
      { name: 'Chicken Biryani', desc: 'Aromatic basmati rice, tender chicken', price: 280 },
      { name: 'Beef Biryani', desc: 'Traditional beef biryani', price: 320 },
      { name: 'Chicken Pulao', desc: 'Mild spiced chicken pulao', price: 270 }
    ]},
    { name: 'BBQ', items: [
      { name: 'Chicken Tikka (Full)', desc: 'Marinated grilled chicken', price: 380 },
      { name: 'Seekh Kebab', desc: '4 pieces, spicy minced beef', price: 320 },
      { name: 'Malai Boti', desc: 'Creamy chicken boti, 8 pieces', price: 420 }
    ]},
    { name: 'Beverages', items: [
      { name: 'Coca Cola (1.5L)', desc: 'Chilled 1.5 liter bottle', price: 130 },
      { name: 'Mineral Water (500ml)', desc: 'Nestle Pure Life', price: 60 },
      { name: 'Fresh Lime', desc: 'Fresh lime with soda/salt', price: 120 },
      { name: 'Mango Lassi', desc: 'Sweet yogurt drink', price: 150 }
    ]}
  ];

  let count = 0;
  categories.forEach((cat, catIndex) => {
    const catId = generateId('cat_');
    db.prepare('INSERT INTO menu_categories (id, restaurant_id, name, sort_order) VALUES (?, ?, ?, ?)')
      .run(catId, req.restaurantId, cat.name, catIndex);
    
    cat.items.forEach((item, itemIndex) => {
      const itemId = generateId('item_');
      db.prepare('INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(itemId, req.restaurantId, catId, item.name, item.desc, item.price, itemIndex);
      count++;
    });
  });

  res.json({ success: true, message: `${count} items added in ${categories.length} categories` });
});

module.exports = router;
