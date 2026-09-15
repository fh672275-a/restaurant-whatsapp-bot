/**
 * Payment Routes - EasyPaisa/JazzCash + 3-day free trial
 * Payment: 03494117212 (Muhammad Ashraf)
 * Customer pays, sends screenshot on WhatsApp
 * Admin verifies and activates subscription
 */

const express = require('express');
const router = express.Router();
const { db, generateId } = require('../db');
const { PRICING_PLANS, PAYMENT_METHODS, EASYPAISA_NUMBER, EASYPAISA_NAME } = require('../config/pricing');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer for screenshot uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', '..', 'data', 'payment_screenshots');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `payment_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Login required' });
  next();
}

// ============ GET PRICING PLANS ============
router.get('/plans', (req, res) => {
  res.json({ 
    plans: Object.values(PRICING_PLANS),
    paymentMethods: Object.values(PAYMENT_METHODS).filter(m => m.active),
    easyPaisaNumber: EASYPAISA_NUMBER,
    easyPaisaName: EASYPAISA_NAME
  });
});

// ============ START FREE TRIAL ============
router.post('/trial', requireAuth, (req, res) => {
  try {
    const { planId } = req.body;
    const plan = PRICING_PLANS[planId];
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });
    
    const restaurantId = req.session.user.id;
    
    // Check if already had trial
    const existingTrial = db.prepare('SELECT id FROM subscriptions WHERE restaurant_id = ? AND trial = 1').get(restaurantId);
    if (existingTrial) {
      return res.status(400).json({ error: 'Aap pehle free trial use kar chuke hain' });
    }
    
    // Deactivate existing subscriptions
    db.prepare('UPDATE subscriptions SET status = ? WHERE restaurant_id = ? AND status = ?')
      .run('cancelled', restaurantId, 'active');
    
    // Create trial subscription
    const subId = generateId('sub_');
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + plan.freeTrialDays);
    
    db.prepare(`INSERT INTO subscriptions 
      (id, restaurant_id, plan_id, status, trial, valid_from, valid_until)
      VALUES (?, ?, ?, 'active', 1, CURRENT_TIMESTAMP, ?)`)
      .run(subId, restaurantId, planId, validUntil.toISOString());
    
    db.prepare('UPDATE restaurants SET subscription_plan = ? WHERE id = ?')
      .run(planId, restaurantId);
    
    res.json({ 
      success: true, 
      message: `${plan.freeTrialDays} din ka free trial shuru ho gaya!`,
      validUntil: validUntil.toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ CREATE PAYMENT REQUEST ============
router.post('/create', requireAuth, (req, res) => {
  try {
    const { planId, paymentMethod } = req.body;
    
    const plan = PRICING_PLANS[planId];
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });
    
    const method = PAYMENT_METHODS[paymentMethod];
    if (!method) return res.status(400).json({ error: 'Invalid payment method' });
    
    const paymentId = generateId('pay_');
    const restaurantId = req.session.user.id;
    
    db.prepare(`INSERT INTO payments 
      (id, restaurant_id, plan_id, amount, currency, payment_method, status, created_at)
      VALUES (?, ?, ?, ?, 'PKR', ?, 'pending', CURRENT_TIMESTAMP)`)
      .run(paymentId, restaurantId, planId, plan.price, paymentMethod);
    
    res.json({
      success: true,
      paymentId,
      amount: plan.price,
      planName: plan.name,
      paymentMethod: method.name,
      accountName: method.accountName,
      accountNumber: method.accountNumber,
      whatsappNumber: method.whatsappNumber,
      instructions: method.instructions,
      message: `Rs. ${plan.price} ${method.name} par bhejein (${method.accountNumber} - ${method.accountName}), phir screenshot upload karein`
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ UPLOAD PAYMENT SCREENSHOT ============
router.post('/screenshot', requireAuth, upload.single('screenshot'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Screenshot upload karein' });
    
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ error: 'Payment ID required' });
    
    const payment = db.prepare('SELECT * FROM payments WHERE id = ? AND restaurant_id = ?').get(paymentId, req.session.user.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    
    // Update payment with screenshot
    db.prepare('UPDATE payments SET screenshot_path = ?, status = ? WHERE id = ?')
      .run(req.file.path, 'verification_pending', paymentId);
    
    res.json({
      success: true,
      message: 'Screenshot upload ho gaya! Admin verify karne k baad aap ka plan activate ho jayega (24 hours)'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ ADMIN: VERIFY PAYMENT ============
router.post('/verify/:paymentId', (req, res) => {
  // Check admin code
  const { adminCode } = req.body;
  if (adminCode !== 'Joai5663@@') {
    return res.status(403).json({ error: 'Invalid admin code' });
  }
  
  try {
    const { paymentId } = req.params;
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    
    db.prepare('UPDATE payments SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('paid', paymentId);
    
    // Activate subscription
    activateSubscription(payment.restaurant_id, payment.plan_id, paymentId);
    
    res.json({ success: true, message: 'Payment verified, plan activated!' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ ADMIN: REJECT PAYMENT ============
router.post('/reject/:paymentId', (req, res) => {
  const { adminCode, reason } = req.body;
  if (adminCode !== 'Joai5663@@') {
    return res.status(403).json({ error: 'Invalid admin code' });
  }
  
  try {
    db.prepare('UPDATE payments SET status = ?, notes = ? WHERE id = ?')
      .run('rejected', reason || 'Invalid payment', req.params.paymentId);
    
    res.json({ success: true, message: 'Payment rejected' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ GET PAYMENT HISTORY ============
router.get('/history', requireAuth, (req, res) => {
  const payments = db.prepare(`
    SELECT p.* FROM payments p
    WHERE p.restaurant_id = ? 
    ORDER BY p.created_at DESC
  `).all(req.session.user.id);
  
  res.json({ payments });
});

// ============ GET SUBSCRIPTION STATUS WITH COUNTDOWN ============
router.get('/subscription', requireAuth, (req, res) => {
  const { checkSubscription } = require('../middleware/subscription');
  const subCheck = checkSubscription(req.session.user.id);
  
  if (subCheck.subscription) {
    const plan = PRICING_PLANS[subCheck.subscription.plan_id];
    res.json({ 
      subscription: subCheck.subscription,
      plan: plan ? { name: plan.name, price: plan.price } : null,
      countdown: subCheck.countdown,
      hasAccess: subCheck.hasAccess,
      isTrial: subCheck.isTrial,
      message: subCheck.message
    });
  } else {
    res.json({ 
      subscription: null,
      hasAccess: false,
      message: subCheck.message
    });
  }
});

// ============ RENEW SUBSCRIPTION (after payment) ============
router.post('/renew', requireAuth, (req, res) => {
  try {
    const { planId } = req.body;
    const plan = PRICING_PLANS[planId];
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });
    
    const restaurantId = req.session.user.id;
    
    // Deactivate old subscriptions
    db.prepare('UPDATE subscriptions SET status = ? WHERE restaurant_id = ? AND status = ?')
      .run('cancelled', restaurantId, 'active');
    
    // Create new subscription (30 days)
    const subId = generateId('sub_');
    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + 1);
    
    db.prepare(`INSERT INTO subscriptions 
      (id, restaurant_id, plan_id, status, trial, valid_from, valid_until)
      VALUES (?, ?, ?, 'active', 0, CURRENT_TIMESTAMP, ?)`)
      .run(subId, restaurantId, planId, validUntil.toISOString());
    
    db.prepare('UPDATE restaurants SET subscription_plan = ? WHERE id = ?')
      .run(planId, restaurantId);
    
    res.json({ 
      success: true, 
      message: 'Plan renew ho gaya! System dobara active hai.',
      validUntil: validUntil.toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ GET CURRENT SUBSCRIPTION ============
router.get('/subscription', requireAuth, (req, res) => {
  const sub = db.prepare(`
    SELECT * FROM subscriptions 
    WHERE restaurant_id = ? AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `).get(req.session.user.id);
  
  if (sub) {
    const plan = PRICING_PLANS[sub.plan_id];
    res.json({ 
      subscription: sub,
      plan: plan ? { name: plan.name, price: plan.price } : null
    });
  } else {
    res.json({ subscription: null });
  }
});

// ============ HELPER: ACTIVATE SUBSCRIPTION ============
function activateSubscription(restaurantId, planId, paymentId) {
  db.prepare('UPDATE subscriptions SET status = ? WHERE restaurant_id = ? AND status = ?')
    .run('cancelled', restaurantId, 'active');
  
  const plan = PRICING_PLANS[planId];
  const subId = generateId('sub_');
  const validUntil = new Date();
  validUntil.setMonth(validUntil.getMonth() + 1);
  
  db.prepare(`INSERT INTO subscriptions 
    (id, restaurant_id, plan_id, payment_id, status, trial, valid_from, valid_until, created_at)
    VALUES (?, ?, ?, ?, 'active', 0, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)`)
    .run(subId, restaurantId, planId, paymentId, validUntil.toISOString());
  
  db.prepare('UPDATE restaurants SET subscription_plan = ? WHERE id = ?')
    .run(planId, restaurantId);
  
  console.log(`[Payment] Subscription activated: ${restaurantId} -> ${planId}`);
}

module.exports = router;
