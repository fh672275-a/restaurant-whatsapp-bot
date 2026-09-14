/**
 * Main Server - Restaurant WhatsApp Bot System
 * 
 * Features:
 * - Multi-restaurant WhatsApp bot (100+ restaurants supported)
 * - One-time QR scan, persistent sessions
 * - Roman English customer interaction
 * - Order management with dashboard
 * - Real-time updates via Socket.io
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const config = require('./src/config');

// Ensure data directories exist
if (!fs.existsSync(config.WHATSAPP_SESSIONS_DIR)) {
  fs.mkdirSync(config.WHATSAPP_SESSIONS_DIR, { recursive: true });
}

// Initialize database
const { initDatabase, db } = require('./src/db');
initDatabase();

// Import routes
const authRoutes = require('./src/routes/auth');
const restaurantRoutes = require('./src/routes/restaurants');
const menuRoutes = require('./src/routes/menus');
const orderRoutes = require('./src/routes/orders');
const whatsappRoutes = require('./src/routes/whatsapp');
const dealsRoutes = require('./src/routes/deals');
const settingsRoutes = require('./src/routes/settings');
const uploadRoutes = require('./src/routes/uploads');
const marketingRoutes = require('./src/routes/marketing');
const paymentRoutes = require('./src/routes/payments');

// Import WhatsApp manager
const waManager = require('./src/whatsapp/manager');

// Create app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Set socket.io on manager
waManager.setSocketIO(io);

// Make io globally accessible for bot handler
global.socketIO = io;
global.app = app;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: '5mb' }));
app.use(session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true
  }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve manifest.json
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

// Serve service worker
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

// ============ HEALTH CHECK (for Railway) ============
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage().rss
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString()
  });
});

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make session user available to all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// ============ Routes ============

// Home page - redirect based on auth
app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  if (req.session.user.type === 'super_admin') {
    return res.redirect('/admin/dashboard');
  }
  return res.redirect('/restaurant/dashboard');
});

// Login page
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login');
});

// Signup page (restaurant self-registration)
app.get('/signup', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('signup');
});

// Onboarding page (after signup)
app.get('/restaurant/onboarding', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('onboarding');
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Admin Dashboard
app.get('/admin/dashboard', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'super_admin') {
    return res.redirect('/login');
  }
  res.render('admin-dashboard');
});

// Admin - Restaurants list
app.get('/admin/restaurants', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'super_admin') {
    return res.redirect('/login');
  }
  res.render('admin-restaurants');
});

// Admin - Add/Edit Restaurant
app.get('/admin/restaurants/new', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'super_admin') {
    return res.redirect('/login');
  }
  res.render('restaurant-form', { mode: 'new' });
});

app.get('/admin/restaurants/:id/edit', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'super_admin') {
    return res.redirect('/login');
  }
  res.render('restaurant-form', { mode: 'edit', restaurantId: req.params.id });
});

// Admin - View restaurant orders
app.get('/admin/restaurants/:id', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'super_admin') {
    return res.redirect('/login');
  }
  res.render('admin-restaurant-detail', { restaurantId: req.params.id });
});

// Restaurant Dashboard
app.get('/restaurant/dashboard', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('restaurant-dashboard');
});

// Restaurant - Menu management
app.get('/restaurant/menu', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('restaurant-menu');
});

// Restaurant - Orders
app.get('/restaurant/orders', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('restaurant-orders');
});

// Restaurant - WhatsApp Connect (QR Code page)
app.get('/restaurant/whatsapp', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('restaurant-whatsapp');
});

// Restaurant - Settings
app.get('/restaurant/settings', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('restaurant-settings');
});

// Restaurant - Deals Management
app.get('/restaurant/deals', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('restaurant-deals');
});

// Restaurant - Hours Management
app.get('/restaurant/hours', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('restaurant-hours');
});

// Restaurant - Delivery Areas
app.get('/restaurant/delivery', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('restaurant-delivery');
});

// Restaurant - Customers
app.get('/restaurant/customers', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('restaurant-customers');
});

// Restaurant - Feedback
app.get('/restaurant/feedback', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('restaurant-feedback');
});

// Restaurant - Broadcasts
app.get('/restaurant/broadcasts', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('restaurant-broadcasts');
});

// Restaurant - Reservations
app.get('/restaurant/reservations', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('restaurant-reservations');
});

// Restaurant - Analytics
app.get('/restaurant/analytics', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('restaurant-analytics');
});

// Restaurant - Bulk Menu Upload
app.get('/restaurant/bulk-upload', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('restaurant-bulk-upload');
});

// Restaurant - Marketing
app.get('/restaurant/marketing', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  res.render('restaurant-marketing');
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/menus', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/payments', paymentRoutes);

// Static file serving for uploads (logos, etc.)
app.use('/data/uploads', express.static(path.join(__dirname, 'data', 'uploads')));

// Socket.io connection
io.on('connection', (socket) => {
  console.log('[IO] Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('[IO] Client disconnected:', socket.id);
  });
});

// Error handler - never crash the server
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  // Don't expose internal errors in production
  if (config.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Server error, please try again' });
  } else {
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// 404 handler
app.use((req, res) => {
  // For API routes, return JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  // For pages, render 404
  try {
    res.status(404).render('404');
  } catch (e) {
    res.status(404).send('Page not found');
  }
});

// ============ GRACEFUL SHUTDOWN & CRASH PROTECTION ============

// Catch uncaught exceptions - NEVER crash
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err.message);
  console.error(err.stack);
  // Don't exit - keep server running
});

// Catch unhandled promise rejections - NEVER crash
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
  // Don't exit - keep server running
});

// Start server
const PORT = config.PORT;
server.listen(PORT, '0.0.0.0', async () => {
  console.log('=================================================');
  console.log('  Restaurant WhatsApp Bot System');
  console.log('=================================================');
  console.log(`  Server running on port: ${PORT}`);
  console.log(`  Dashboard: http://localhost:${PORT}`);
  console.log(`  Admin login: admin / admin123`);
  console.log('=================================================');
  console.log('');
  
  // Restore previously connected WhatsApp sessions
  console.log('[Startup] Restoring WhatsApp sessions...');
  try {
    await waManager.initializeConnectedRestaurants();
    console.log('[Startup] All sessions restored.');
  } catch (e) {
    console.error('[Startup] Session restore error:', e.message);
  }
  
  console.log('');
  console.log('✅ System ready! Open dashboard and connect a restaurant WhatsApp.');
});

// Handle graceful shutdown
let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Shutdown] ${signal} received. Cleaning up...`);
  
  // Close WhatsApp sessions
  for (const [restaurantId, session] of waManager.sessions) {
    try {
      if (session.socket && typeof session.socket.end === 'function') {
        session.socket.end();
      }
    } catch (e) {
      // ignore
    }
  }
  
  // Close database
  try {
    const { db } = require('./src/db');
    db.close();
    console.log('[Shutdown] Database closed.');
  } catch (e) {
    // ignore
  }
  
  // Close server
  server.close(() => {
    console.log('[Shutdown] Server closed.');
    process.exit(0);
  });
  
  // Force exit after 5 seconds
  setTimeout(() => {
    console.log('[Shutdown] Force exit.');
    process.exit(0);
  }, 5000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err.message);
  console.error(err.stack);
});

module.exports = { app, server, io, getIO: () => io };
