/**
 * Configuration file for Restaurant WhatsApp Bot System
 */

const path = require('path');

module.exports = {
  // Server config
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Session secret for express-session
  SESSION_SECRET: process.env.SESSION_SECRET || 'restaurant-whatsapp-bot-secret-2024-super-secure',
  
  // Database config
  // For local: SQLite file
  // For cloud: PostgreSQL URL (DATABASE_URL=postgresql://...)
  DATABASE_URL: process.env.DATABASE_URL || '',
  USE_POSTGRES: !!(process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')),
  DB_PATH: path.join(__dirname, '..', 'data', 'app.db'),
  
  // WhatsApp sessions storage
  WHATSAPP_SESSIONS_DIR: path.join(__dirname, '..', 'data', 'whatsapp_sessions'),
  
  // Default super admin credentials (change after first login)
  SUPER_ADMIN: {
    username: process.env.SUPER_ADMIN_USERNAME || 'admin',
    password: process.env.SUPER_ADMIN_PASSWORD || 'admin123'
  },
  
  // Bot settings
  BOT: {
    AUTO_GREET: true,
    ORDER_SESSION_TIMEOUT: parseInt(process.env.BOT_ORDER_SESSION_TIMEOUT) || 30,
    MAX_ORDER_ITEMS: 50
  },
  
  // Pagination
  PAGE_SIZE: 20
};
