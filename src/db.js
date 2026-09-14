/**
 * Database Layer - SQLite (works on Railway with persistent volume)
 * 
 * Uses better-sqlite3 for fast sync operations.
 * Railway: Mount a volume at /data to persist SQLite database.
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Determine database path
// Railway: Use /data/app.db (mounted volume)
// Local: Use data/app.db
const DB_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH 
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'app.db')
  : config.DB_PATH;

// Determine WhatsApp sessions directory
const SESSIONS_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'whatsapp_sessions')
  : config.WHATSAPP_SESSIONS_DIR;

// Ensure directories exist
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Update config paths
config.DB_PATH = DB_PATH;
config.WHATSAPP_SESSIONS_DIR = SESSIONS_DIR;

// Create database connection
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Handle cleanup on exit
process.on('beforeExit', () => {
  try {
    db.close();
  } catch (e) {}
});

/**
 * Initialize database schema (all tables)
 */
function initDatabase() {
  console.log('[DB] Using SQLite at:', DB_PATH);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS super_admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
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
      currency TEXT DEFAULT 'Rs.',
      delivery_fee_default REAL DEFAULT 100,
      min_order_amount REAL DEFAULT 0,
      logo_url TEXT,
      tax_percentage REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS menu_categories (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );
    
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
    
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_name TEXT,
      customer_address TEXT,
      order_type TEXT DEFAULT 'delivery',
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      delivery_fee REAL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT DEFAULT 'new',
      notes TEXT,
      whatsapp_message_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS bot_conversations (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      state TEXT DEFAULT 'idle',
      cart_json TEXT DEFAULT '[]',
      order_type TEXT,
      notes TEXT,
      last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(restaurant_id, customer_phone),
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      original_price REAL,
      deal_price REAL NOT NULL,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      valid_from DATETIME,
      valid_until DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS deal_items (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL,
      menu_item_id TEXT,
      custom_name TEXT,
      quantity INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL
    );
    
    CREATE TABLE IF NOT EXISTS operating_hours (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      open_time TEXT,
      close_time TEXT,
      is_closed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(restaurant_id, day_of_week),
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS delivery_areas (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      delivery_fee REAL DEFAULT 0,
      estimated_time TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS customer_feedback (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      order_id TEXT,
      customer_phone TEXT NOT NULL,
      customer_name TEXT,
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    );
    
    CREATE TABLE IF NOT EXISTS broadcasts (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      target_audience TEXT DEFAULT 'all',
      status TEXT DEFAULT 'draft',
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      scheduled_at DATETIME,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_name TEXT,
      party_size INTEGER DEFAULT 2,
      reservation_date TEXT NOT NULL,
      reservation_time TEXT NOT NULL,
      special_request TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS menu_item_variations (
      id TEXT PRIMARY KEY,
      menu_item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      price_modifier REAL DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'general',
      target_audience TEXT DEFAULT 'all',
      status TEXT DEFAULT 'draft',
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      scheduled_at DATETIME,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'PKR',
      payment_method TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      transaction_id TEXT,
      paid_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      payment_id TEXT,
      status TEXT DEFAULT 'active',
      valid_from DATETIME,
      valid_until DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_customers_restaurant ON customers(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_menu_variations_item ON menu_item_variations(menu_item_id);
    CREATE INDEX IF NOT EXISTS idx_deals_restaurant ON deals(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_operating_hours_restaurant ON operating_hours(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_delivery_areas_restaurant ON delivery_areas(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_restaurant ON customer_feedback(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_broadcasts_restaurant ON broadcasts(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_restaurant ON reservations(restaurant_id);
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

  
  // Add new columns for payments/subscriptions
  try { db.exec('ALTER TABLE restaurants ADD COLUMN subscription_plan TEXT'); } catch(e) {}
  try { db.exec('ALTER TABLE payments ADD COLUMN screenshot_path TEXT'); } catch(e) {}
  try { db.exec('ALTER TABLE payments ADD COLUMN notes TEXT'); } catch(e) {}
  try { db.exec('ALTER TABLE subscriptions ADD COLUMN trial INTEGER DEFAULT 0'); } catch(e) {}

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
