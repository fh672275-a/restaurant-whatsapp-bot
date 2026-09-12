/**
 * SQLite Database Layer
 * Handles all database operations for the Restaurant WhatsApp Bot
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Ensure data directory exists
const dataDir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Initialize database schema
 */
function initDatabase() {
  // Super admins (system-wide admins)
  db.exec(`
    CREATE TABLE IF NOT EXISTS super_admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Restaurants (multi-tenant)
  db.exec(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_name TEXT,
      phone TEXT UNIQUE NOT NULL,
      email TEXT,
      address TEXT,
      password TEXT NOT NULL,
      whatsapp_connected INTEGER DEFAULT 0,
      whatsapp_phone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Menu categories
  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_categories (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );
  `);

  // Menu items
  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      category_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      is_available INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE SET NULL
    );
  `);

  // Customers (per restaurant)
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      name TEXT,
      address TEXT,
      total_orders INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(restaurant_id, phone),
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );
  `);

  // Orders
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_name TEXT,
      customer_address TEXT,
      order_type TEXT DEFAULT 'delivery', -- delivery, pickup
      items_json TEXT NOT NULL, -- JSON array of {name, qty, price}
      subtotal REAL NOT NULL,
      delivery_fee REAL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT DEFAULT 'new', -- new, confirmed, preparing, ready, delivered, cancelled
      notes TEXT,
      whatsapp_message_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );
  `);

  // Order status history
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
  `);

  // Bot conversation state (per customer per restaurant)
  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_conversations (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      state TEXT DEFAULT 'idle', -- idle, ordering, awaiting_name, awaiting_address, awaiting_confirmation
      cart_json TEXT DEFAULT '[]',
      order_type TEXT,
      last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(restaurant_id, customer_phone),
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_customers_restaurant ON customers(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
  `);

  // Seed super admin if not exists
  const adminExists = db.prepare('SELECT id FROM super_admins WHERE username = ?').get(config.SUPER_ADMIN.username);
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync(config.SUPER_ADMIN.password, 10);
    db.prepare('INSERT INTO super_admins (username, password, name) VALUES (?, ?, ?)').run(
      config.SUPER_ADMIN.username,
      hashedPassword,
      'Super Admin'
    );
    console.log('[DB] Super admin created. Username: admin, Password: admin123');
  }

  console.log('[DB] Database initialized successfully');
}

// Helper for generating IDs
const { nanoid } = require('nanoid');
function generateId(prefix = '') {
  return prefix + nanoid(12);
}

module.exports = {
  db,
  initDatabase,
  generateId
};
