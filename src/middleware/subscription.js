/**
 * Subscription Check Middleware
 * 
 * - Checks if restaurant has active subscription
 * - Blocks access when subscription expires
 * - Returns subscription status + countdown info
 */

const { db } = require('../db');
const { PRICING_PLANS } = require('../config/pricing');

function getActiveSubscription(restaurantId) {
  try {
    return db.prepare(`
      SELECT * FROM subscriptions 
      WHERE restaurant_id = ? AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `).get(restaurantId);
  } catch (e) {
    return null;
  }
}

function isSubscriptionValid(subscription) {
  if (!subscription) return false;
  if (subscription.status !== 'active') return false;
  if (subscription.valid_until) {
    const validUntil = new Date(subscription.valid_until);
    const now = new Date();
    if (now > validUntil) return false;
  }
  return true;
}

function getDaysRemaining(subscription) {
  if (!subscription || !subscription.valid_until) return 0;
  const validUntil = new Date(subscription.valid_until);
  const now = new Date();
  const diffTime = validUntil - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

function getCountdownInfo(subscription) {
  if (!subscription || !subscription.valid_until) {
    return { valid: false, days: 0, hours: 0, minutes: 0, expired: true };
  }
  
  const validUntil = new Date(subscription.valid_until);
  const now = new Date();
  const diffTime = validUntil - now;
  
  if (diffTime <= 0) {
    try {
      db.prepare("UPDATE subscriptions SET status = 'expired' WHERE id = ?").run(subscription.id);
    } catch (e) {}
    return { valid: false, days: 0, hours: 0, minutes: 0, expired: true };
  }
  
  const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffTime % (1000 * 60)) / 1000);
  
  return { valid: true, days, hours, minutes, seconds, expired: false, validUntil: subscription.valid_until };
}

function checkSubscription(restaurantId) {
  const subscription = getActiveSubscription(restaurantId);
  
  if (!subscription) {
    return {
      hasAccess: false,
      subscription: null,
      countdown: null,
      plan: null,
      message: 'Koi active plan nahi hai. Plan select karein ya free trial start karein.'
    };
  }
  
  const countdown = getCountdownInfo(subscription);
  const plan = PRICING_PLANS[subscription.plan_id];
  
  return {
    hasAccess: countdown.valid,
    subscription,
    countdown,
    plan,
    isTrial: subscription.trial === 1,
    message: countdown.valid 
      ? (subscription.trial === 1 ? `Free trial - ${countdown.days}d ${countdown.hours}h baqi` : `Plan active - ${countdown.days}d baqi`)
      : 'Plan expire ho gaya. Renew karein.'
  };
}

function requireActiveSubscription(req, res, next) {
  if (!req.session.user || req.session.user.type !== 'restaurant') {
    return res.redirect('/login');
  }
  
  const subCheck = checkSubscription(req.session.user.id);
  
  if (!subCheck.subscription) {
    const allowedPaths = ['/restaurant/pricing', '/restaurant/settings', '/restaurant/whatsapp', '/logout', '/api/payments', '/api/auth', '/api/restaurants'];
    const isAllowed = allowedPaths.some(p => req.path.startsWith(p));
    if (isAllowed) return next();
    return res.redirect('/restaurant/pricing?expired=true');
  }
  
  if (!subCheck.hasAccess) {
    const allowedPaths = ['/restaurant/pricing', '/restaurant/settings', '/logout', '/api/payments', '/api/auth', '/api/restaurants'];
    const isAllowed = allowedPaths.some(p => req.path.startsWith(p));
    if (isAllowed) return next();
    return res.redirect('/restaurant/pricing?expired=true');
  }
  
  next();
}

module.exports = {
  getActiveSubscription,
  isSubscriptionValid,
  getDaysRemaining,
  getCountdownInfo,
  checkSubscription,
  requireActiveSubscription
};
