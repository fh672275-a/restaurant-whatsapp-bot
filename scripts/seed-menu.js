/**
 * Seed sample menu for restaurant
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');

const db = new Database('/home/z/my-project/data/app.db');

const restaurant = db.prepare('SELECT id, name FROM restaurants').get();

if (!restaurant) {
  console.log('❌ Koi restaurant nahi hai');
  process.exit(1);
}

console.log('Restaurant:', restaurant.name);

// Check existing items
const existing = db.prepare('SELECT COUNT(*) as count FROM menu_items WHERE restaurant_id = ?').get(restaurant.id);
if (existing.count > 0) {
  console.log('Menu already has', existing.count, 'items. Delete them first if you want to reseed.');
  process.exit(0);
}

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

let totalItems = 0;
categories.forEach((cat, catIndex) => {
  const catId = 'cat_' + nanoid(12);
  db.prepare('INSERT INTO menu_categories (id, restaurant_id, name, sort_order) VALUES (?, ?, ?, ?)')
    .run(catId, restaurant.id, cat.name, catIndex);
  
  cat.items.forEach((item, itemIndex) => {
    const itemId = 'item_' + nanoid(12);
    db.prepare('INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(itemId, restaurant.id, catId, item.name, item.desc, item.price, itemIndex);
    totalItems++;
  });
});

console.log('✅ Sample menu added:');
console.log('  Categories:', categories.length);
console.log('  Items:', totalItems);
console.log('');
console.log('Menu Categories:');
categories.forEach(c => console.log('  -', c.name, '(' + c.items.length + ' items)'));

db.close();
