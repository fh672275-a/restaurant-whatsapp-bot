/**
 * Pricing Plans Configuration - ACTIVATED
 * 
 * 4 Plans with 3-day free trial
 * Payment via EasyPaisa/JazzCash: 03494117212 (Muhammad Ashraf)
 */

const PRICING_PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter Plan',
    price: 3000,
    currency: 'PKR',
    interval: 'month',
    popular: false,
    active: true,
    freeTrialDays: 3,
    features: {
      maxRestaurants: 1,
      maxMenuItems: -1,
      maxOrdersPerMonth: 500,
      maxDeals: 5,
      whatsappBot: true,
      bulkMenuUpload: true,
      analytics: 'basic',
      marketing: false,
      aiMarketing: false,
      logoUpload: true
    },
    description: 'Single restaurant - perfect for starting'
  },
  
  pro: {
    id: 'pro',
    name: 'Pro Plan',
    price: 5000,
    currency: 'PKR',
    interval: 'month',
    popular: true,
    active: true,
    freeTrialDays: 3,
    features: {
      maxRestaurants: 1,
      maxMenuItems: -1,
      maxOrdersPerMonth: -1,
      maxDeals: -1,
      whatsappBot: true,
      bulkMenuUpload: true,
      analytics: 'advanced',
      marketing: true,
      aiMarketing: true,
      aiMarketingAdsPerMonth: 50,
      reservations: true,
      feedback: true,
      broadcastMessages: true,
      logoUpload: true,
      deliveryAreas: true,
      operatingHours: true
    },
    description: 'Most popular - full features'
  },
  
  business: {
    id: 'business',
    name: 'Business Plan',
    price: 8500,
    currency: 'PKR',
    interval: 'month',
    popular: false,
    active: true,
    freeTrialDays: 3,
    features: {
      maxRestaurants: 5,
      maxMenuItems: -1,
      maxOrdersPerMonth: -1,
      whatsappBot: true,
      bulkMenuUpload: true,
      analytics: 'advanced',
      marketing: true,
      aiMarketing: true,
      aiMarketingAdsPerMonth: 200,
      reservations: true,
      feedback: true,
      broadcastMessages: true,
      logoUpload: true,
      customBranding: true,
      apiAccess: true,
      multiBranch: true,
      maxBranches: 5,
      prioritySupport: true
    },
    description: 'Multi-branch restaurants'
  },
  
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise Plan',
    price: 18500,
    currency: 'PKR',
    interval: 'month',
    popular: false,
    active: true,
    freeTrialDays: 3,
    features: {
      maxRestaurants: -1,
      whatsappBot: true,
      bulkMenuUpload: true,
      analytics: 'enterprise',
      marketing: true,
      aiMarketing: true,
      aiMarketingAdsPerMonth: -1,
      multiBranch: true,
      maxBranches: -1,
      customBranding: true,
      apiAccess: true,
      prioritySupport: true,
      dedicatedServer: true,
      whiteLabel: true,
      training: true
    },
    description: 'Large chains with dedicated infrastructure'
  }
};

const PAYMENT_METHODS = {
  easypaisa: {
    id: 'easypaisa',
    name: 'EasyPaisa',
    active: true,
    accountName: 'Muhammad Ashraf',
    accountNumber: '03494117212',
    whatsappNumber: '03494117212',
    instructions: 'EasyPaisa app se 03494117212 (Muhammad Ashraf) par payment karein, phir screenshot WhatsApp par bhejein'
  },
  jazzcash: {
    id: 'jazzcash',
    name: 'JazzCash',
    active: true,
    accountName: 'Muhammad Ashraf',
    accountNumber: '03494117212',
    whatsappNumber: '03494117212',
    instructions: 'JazzCash app se 03494117212 (Muhammad Ashraf) par payment karein, phir screenshot WhatsApp par bhejein'
  }
};

const ADMIN_ACCESS_CODE = 'Joai5663@@';
const EASYPAISA_NUMBER = '03494117212';
const EASYPAISA_NAME = 'Muhammad Ashraf';

module.exports = {
  PRICING_PLANS,
  PAYMENT_METHODS,
  ADMIN_ACCESS_CODE,
  EASYPAISA_NUMBER,
  EASYPAISA_NAME,
  getPlan: (planId) => PRICING_PLANS[planId] || null,
  getActivePlans: () => Object.values(PRICING_PLANS).filter(p => p.active),
  hasFeature: (planId, feature) => {
    const plan = PRICING_PLANS[planId];
    if (!plan) return false;
    return plan.features[feature] === true;
  },
  getLimit: (planId, feature) => {
    const plan = PRICING_PLANS[planId];
    if (!plan) return 0;
    return plan.features[feature] || 0;
  }
};
