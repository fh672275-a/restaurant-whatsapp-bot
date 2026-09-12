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
  
  // Database path
  DB_PATH: path.join(__dirname, '..', 'data', 'app.db'),
  
  // WhatsApp sessions storage
  WHATSAPP_SESSIONS_DIR: path.join(__dirname, '..', 'data', 'whatsapp_sessions'),
  
  // Default super admin credentials (change after first login)
  SUPER_ADMIN: {
    username: 'admin',
    password: 'admin123'  // Will be hashed on first run
  },
  
  // Bot settings
  BOT: {
    // Auto-greet customers when they first message
    AUTO_GREET: true,
    // Session timeout for customer orders (minutes)
    ORDER_SESSION_TIMEOUT: 30,
    // Max items per order
    MAX_ORDER_ITEMS: 50
  },
  
  // Pagination
  PAGE_SIZE: 20
};
