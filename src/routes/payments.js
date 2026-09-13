/**
 * Payment Integration - JazzCash & EasyPaisa
 * 
 * Supports:
 * - JazzCash (mobile account + card)
 * - EasyPaisa (mobile account)
 * - Bank Transfer (manual)
 * 
 * Flow:
 * 1. Restaurant owner selects plan
 * 2. System creates payment request
 * 3. User pays via JazzCash/EasyPaisa
 * 4. Webhook confirms payment
 * 5. Subscription activated
 * 
 * NOTE: Sandbox/test mode for now.
 * Production requires merchant accounts from JazzCash/EasyPaisa.
 */

const express = require('express');
const router = express.Router();
const { db, generateId } = require('../db');
const { PRICING_PLANS, PAYMENT_METHODS } = require('../config/pricing');

// ============ CONFIG ============

const PAYMENT_CONFIG = {
  jazzcash: {
    // Sandbox credentials (replace with production when available)
    merchantId: process.env.JAZZCASH_MERCHANT_ID || 'MC12345',
    password: process.env.JAZZCASH_PASSWORD || 'sandbox123',
    integritySalt: process.env.JAZZCASH_INTEGRITY_SALT || 'sandbox123',
    returnUrl: process.env.JAZZCASH_RETURN_URL || '/api/payments/jazzcash/callback',
    sandbox: process.env.NODE_ENV !== 'production'
  },
  easypaisa: {
    // Sandbox credentials
    merchantId: process.env.EASYPAISA_MERCHANT_ID || 'EP12345',
    storeId: process.env.EASYPAISA_STORE_ID || 'sandbox',
    token: process.env.EASYPAISA_TOKEN || 'sandbox-token',
    returnUrl: process.env.EASYPAISA_RETURN_URL || '/api/payments/easypaisa/callback',
    sandbox: process.env.NODE_ENV !== 'production'
  }
};

// ============ MIDDLEWARE ============

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Login required' });
  next();
}

// ============ GET PRICING PLANS ============

router.get('/plans', (req, res) => {
  res.json({ 
    plans: Object.values(PRICING_PLANS),
    paymentMethods: Object.values(PAYMENT_METHODS).filter(m => m.active)
  });
});

// ============ CREATE PAYMENT ============

router.post('/create', requireAuth, (req, res) => {
  try {
    const { planId, paymentMethod } = req.body;
    
    const plan = PRICING_PLANS[planId];
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });
    if (!plan.active) return res.status(400).json({ error: 'Plan not available yet' });
    
    const method = PAYMENT_METHODS[paymentMethod];
    if (!method || !method.active) return res.status(400).json({ error: 'Invalid payment method' });
    
    const paymentId = generateId('pay_');
    const restaurantId = req.session.user.id;
    
    // Create payment record
    db.prepare(`INSERT INTO payments 
      (id, restaurant_id, plan_id, amount, currency, payment_method, status, created_at)
      VALUES (?, ?, ?, ?, 'PKR', ?, 'pending', CURRENT_TIMESTAMP)`)
      .run(paymentId, restaurantId, planId, plan.price, paymentMethod);
    
    // Generate payment URL based on method
    let paymentUrl = null;
    let paymentInstructions = null;
    
    if (paymentMethod === 'jazzcash') {
      // JazzCash payment URL (sandbox or production)
      paymentUrl = PAYMENT_CONFIG.jazzcash.sandbox 
        ? `https://sandbox.jazzcash.com.pk/CustomerPortal/transaction/transaction?paymentId=${paymentId}`
        : `https://payments.jazzcash.com.pk/CustomerPortal/transaction/transaction?paymentId=${paymentId}`;
      
      paymentInstructions = {
        title: 'JazzCash Payment',
        steps: [
          'JazzCash app open karein',
          'Scan QR code ya payment link par click karein',
          `Rs. ${plan.price} pay karein`,
          'Payment confirm hone par aap ka plan activate ho jayega'
        ]
      };
    } else if (paymentMethod === 'easypaisa') {
      paymentUrl = PAYMENT_CONFIG.easypaisa.sandbox
        ? `https://sandbox.easypaisa.com.pk/transaction?paymentId=${paymentId}`
        : `https://easypaisa.com.pk/transaction?paymentId=${paymentId}`;
      
      paymentInstructions = {
        title: 'EasyPaisa Payment',
        steps: [
          'EasyPaisa app open karein',
          'Payment link par click karein',
          `Rs. ${plan.price} pay karein`,
          'Payment confirm hone par aap ka plan activate ho jayega'
        ]
      };
    } else if (paymentMethod === 'bank') {
      paymentInstructions = {
        title: 'Bank Transfer',
        bankDetails: {
          bankName: 'HBL - Habib Bank Limited',
          accountTitle: 'Restaurant Bot Pvt Ltd',
          accountNumber: '1234567890',
          iban: 'PK36HABB0000123456789012'
        },
        steps: [
          `Rs. ${plan.price} transfer karein`,
          'Transaction screenshot/receipt upload karein',
          'Verification k baad plan activate hoga (24 hours)'
        ]
      };
    }
    
    res.json({
      success: true,
      paymentId,
      amount: plan.price,
      currency: 'PKR',
      paymentUrl,
      instructions: paymentInstructions,
      message: 'Payment request created'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ PAYMENT CALLBACK - JAZZCASH ============

router.post('/jazzcash/callback', (req, res) => {
  try {
    const { paymentId, status, txnRef } = req.body;
    
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    
    if (status === 'paid' || status === 'success') {
      // Update payment status
      db.prepare('UPDATE payments SET status = ?, transaction_id = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('paid', txnRef, paymentId);
      
      // Activate subscription
      activateSubscription(payment.restaurant_id, payment.plan_id, paymentId);
      
      res.json({ success: true, message: 'Payment successful, plan activated!' });
    } else {
      db.prepare('UPDATE payments SET status = ? WHERE id = ?').run('failed', paymentId);
      res.json({ success: false, message: 'Payment failed' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ PAYMENT CALLBACK - EASYPAISA ============

router.post('/easypaisa/callback', (req, res) => {
  try {
    const { paymentId, status, txnRef } = req.body;
    
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    
    if (status === 'paid' || status === 'success') {
      db.prepare('UPDATE payments SET status = ?, transaction_id = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('paid', txnRef, paymentId);
      
      activateSubscription(payment.restaurant_id, payment.plan_id, paymentId);
      
      res.json({ success: true, message: 'Payment successful, plan activated!' });
    } else {
      db.prepare('UPDATE payments SET status = ? WHERE id = ?').run('failed', paymentId);
      res.json({ success: false, message: 'Payment failed' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ MANUAL PAYMENT CONFIRMATION (Admin) ============

router.post('/confirm/:paymentId', (req, res) => {
  if (!req.session.user || req.session.user.type !== 'super_admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  
  try {
    const { paymentId } = req.params;
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    
    db.prepare('UPDATE payments SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('paid', paymentId);
    
    activateSubscription(payment.restaurant_id, payment.plan_id, paymentId);
    
    res.json({ success: true, message: 'Payment confirmed, plan activated!' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ GET PAYMENT HISTORY ============

router.get('/history', requireAuth, (req, res) => {
  const payments = db.prepare(`
    SELECT p.*, pr.name as plan_name 
    FROM payments p 
    LEFT JOIN pricing_ref pr ON p.plan_id = pr.plan_id
    WHERE p.restaurant_id = ? 
    ORDER BY p.created_at DESC
  `).all(req.session.user.id);
  
  res.json({ payments });
});

// ============ GET CURRENT SUBSCRIPTION ============

router.get('/subscription', requireAuth, (req, res) => {
  const sub = db.prepare(`
    SELECT s.*, p.name as plan_name 
    FROM subscriptions s 
    LEFT JOIN pricing_ref p ON s.plan_id = p.plan_id
    WHERE s.restaurant_id = ? AND s.status = 'active'
    ORDER BY s.created_at DESC LIMIT 1
  `).get(req.session.user.id);
  
  res.json({ subscription: sub });
});

// ============ HELPER: ACTIVATE SUBSCRIPTION ============

function activateSubscription(restaurantId, planId, paymentId) {
  // Deactivate existing subscriptions
  db.prepare('UPDATE subscriptions SET status = ? WHERE restaurant_id = ? AND status = ?')
    .run('cancelled', restaurantId, 'active');
  
  // Create new subscription
  const plan = PRICING_PLANS[planId];
  const subId = generateId('sub_');
  const validUntil = new Date();
  validUntil.setMonth(validUntil.getMonth() + 1); // 1 month
  
  db.prepare(`INSERT INTO subscriptions 
    (id, restaurant_id, plan_id, payment_id, status, valid_from, valid_until, created_at)
    VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)`)
    .run(subId, restaurantId, planId, paymentId, validUntil.toISOString());
  
  // Update restaurant with plan
  db.prepare('UPDATE restaurants SET subscription_plan = ? WHERE id = ?')
    .run(planId, restaurantId);
  
  console.log(`[Payment] Subscription activated: ${restaurantId} -> ${planId}`);
}

module.exports = router;
