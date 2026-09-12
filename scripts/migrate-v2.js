/**
 * Database Schema V2 - Add new tables for complete restaurant management
 * 
 * Adds:
 * - menu_item_variations (sizes, add-ons)
 * - deals (combo packages)
 * - deal_items (items in deals)
 * - operating_hours (open/close per day)
 * - delivery_areas (zones with charges)
 * - customer_feedback (ratings)
 * - broadcasts (promotional messages)
 */

const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'app.db');
const db = new Database(dbPath);

console.log('=== Adding new tables for V2 ===\n');

// 1. Menu Item Variations (sizes, add-ons, extras)
db.exec(`
  CREATE TABLE IF NOT EXISTS menu_item_variations (
    id TEXT PRIMARY KEY,
    menu_item_id TEXT NOT NULL,
    type TEXT NOT NULL, -- 'size', 'addon', 'extra'
    name TEXT NOT NULL, -- e.g., 'Large', 'Extra Cheese', 'Spicy'
    price_modifier REAL DEFAULT 0, -- additional price (+50, +0, -20)
    is_default INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
  );
`);
console.log('✅ menu_item_variations table created');

// 2. Deals (combo packages)
db.exec(`
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
`);
console.log('✅ deals table created');

// 3. Deal Items (items included in deals)
db.exec(`
  CREATE TABLE IF NOT EXISTS deal_items (
    id TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL,
    menu_item_id TEXT,
    custom_name TEXT, -- if item doesn't exist in menu
    quantity INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL
  );
`);
console.log('✅ deal_items table created');

// 4. Operating Hours (per day)
db.exec(`
  CREATE TABLE IF NOT EXISTS operating_hours (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    day_of_week INTEGER NOT NULL, -- 0=Sunday, 6=Saturday
    open_time TEXT, -- "09:00"
    close_time TEXT, -- "23:00"
    is_closed INTEGER DEFAULT 0, -- 1 if closed that day
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(restaurant_id, day_of_week),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
  );
`);
console.log('✅ operating_hours table created');

// 5. Delivery Areas (zones with charges)
db.exec(`
  CREATE TABLE IF NOT EXISTS delivery_areas (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    name TEXT NOT NULL, -- e.g., 'Gulshan', 'Gulberg', 'Defence'
    delivery_fee REAL DEFAULT 0,
    estimated_time TEXT, -- "30-45 min"
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
  );
`);
console.log('✅ delivery_areas table created');

// 6. Customer Feedback (ratings)
db.exec(`
  CREATE TABLE IF NOT EXISTS customer_feedback (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    order_id TEXT,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    rating INTEGER NOT NULL, -- 1-5
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
  );
`);
console.log('✅ customer_feedback table created');

// 7. Broadcasts (promotional messages)
db.exec(`
  CREATE TABLE IF NOT EXISTS broadcasts (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_audience TEXT DEFAULT 'all', -- all, recent, vip
    status TEXT DEFAULT 'draft', -- draft, scheduled, sent, cancelled
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    scheduled_at DATETIME,
    sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
  );
`);
console.log('✅ broadcasts table created');

// 8. Reservations (table bookings)
db.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    party_size INTEGER DEFAULT 2,
    reservation_date TEXT NOT NULL,
    reservation_time TEXT NOT NULL,
    special_request TEXT,
    status TEXT DEFAULT 'pending', -- pending, confirmed, cancelled, completed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
  );
`);
console.log('✅ reservations table created');

// Add columns to restaurants table for extra settings
try {
  db.exec(`ALTER TABLE restaurants ADD COLUMN currency TEXT DEFAULT 'Rs.';`);
  console.log('✅ Added currency column to restaurants');
} catch (e) { /* column exists */ }

try {
  db.exec(`ALTER TABLE restaurants ADD COLUMN delivery_fee_default REAL DEFAULT 100;`);
  console.log('✅ Added delivery_fee_default column to restaurants');
} catch (e) { /* column exists */ }

try {
  db.exec(`ALTER TABLE restaurants ADD COLUMN min_order_amount REAL DEFAULT 0;`);
  console.log('✅ Added min_order_amount column to restaurants');
} catch (e) { /* column exists */ }

try {
  db.exec(`ALTER TABLE restaurants ADD COLUMN logo_url TEXT;`);
  console.log('✅ Added logo_url column to restaurants');
} catch (e) { /* column exists */ }

try {
  db.exec(`ALTER TABLE restaurants ADD COLUMN tax_percentage REAL DEFAULT 0;`);
  console.log('✅ Added tax_percentage column to restaurants');
} catch (e) { /* column exists */ }

// Create indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_menu_variations_item ON menu_item_variations(menu_item_id);
  CREATE INDEX IF NOT EXISTS idx_deals_restaurant ON deals(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_operating_hours_restaurant ON operating_hours(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_delivery_areas_restaurant ON delivery_areas(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_restaurant ON customer_feedback(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_broadcasts_restaurant ON broadcasts(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_reservations_restaurant ON reservations(restaurant_id);
`);

console.log('\n=== All V2 tables created successfully ===');
db.close();
