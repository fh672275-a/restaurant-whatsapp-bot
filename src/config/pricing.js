/**
 * Pricing Plans Configuration
 * 
 * NOTE: These plans are saved but NOT yet activated.
 * Will be activated when user says so.
 * 
 * Pricing as per user's request (Pakistan market):
 * 1. Starter Plan - Rs. 3,000/month
 * 2. Pro Plan - Rs. 5,000/month (Most Popular)
 * 3. Business Plan - Rs. 8,500/month
 * 4. Enterprise Plan - Rs. 18,500/month
 */

const PRICING_PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter Plan',
    nameUrdu: 'Starter Plan',
    price: 3000,
    currency: 'PKR',
    interval: 'month',
    popular: false,
    active: false,
    features: {
      maxRestaurants: 1,
      maxMenuItems: -1,
      maxOrdersPerMonth: 500,
      maxDeals: 5,
      whatsappBot: true,
      whatsappBot24x7: true,
      orderManagement: true,
      bulkMenuUpload: true,
      bulkUploadFormats: ['csv', 'pdf', 'json'],
      analytics: 'basic',
      customerSupport: 'email',
      marketing: false,
      aiMarketing: false,
      reservations: false,
      feedback: false,
      broadcastMessages: false,
      logoUpload: true,
      customBranding: false,
      apiAccess: false,
      multiBranch: false
    },
    description: 'Perfect for single restaurant starting up',
    descriptionUrdu: 'Naye restaurants k liye perfect'
  },
  
  pro: {
    id: 'pro',
    name: 'Pro Plan',
    nameUrdu: 'Pro Plan',
    price: 5000,
    currency: 'PKR',
    interval: 'month',
    popular: true,
    active: false,
    features: {
      maxRestaurants: 1,
      maxMenuItems: -1,
      maxOrdersPerMonth: -1,
      maxDeals: -1,
      whatsappBot: true,
      whatsappBot24x7: true,
      orderManagement: true,
      bulkMenuUpload: true,
      bulkUploadFormats: ['csv', 'pdf', 'json'],
      analytics: 'advanced',
      customerSupport: 'priority_email',
      marketing: true,
      aiMarketing: true,
      aiMarketingAdsPerMonth: 50,
      reservations: true,
      feedback: true,
      broadcastMessages: true,
      maxBroadcastsPerMonth: 20,
      logoUpload: true,
      customBranding: false,
      apiAccess: false,
      multiBranch: false,
      deliveryAreas: true,
      operatingHours: true,
      customDomain: false
    },
    description: 'Most popular - full features for growing restaurants',
    descriptionUrdu: 'Sab se popular - growing restaurants k liye'
  },
  
  business: {
    id: 'business',
    name: 'Business Plan',
    nameUrdu: 'Business Plan',
    price: 8500,
    currency: 'PKR',
    interval: 'month',
    popular: false,
    active: false,
    features: {
      maxRestaurants: 5,
      maxMenuItems: -1,
      maxOrdersPerMonth: -1,
      maxDeals: -1,
      whatsappBot: true,
      whatsappBot24x7: true,
      orderManagement: true,
      bulkMenuUpload: true,
      bulkUploadFormats: ['csv', 'pdf', 'json'],
      analytics: 'advanced',
      customerSupport: 'phone',
      marketing: true,
      aiMarketing: true,
      aiMarketingAdsPerMonth: 200,
      reservations: true,
      feedback: true,
      broadcastMessages: true,
      maxBroadcastsPerMonth: -1,
      logoUpload: true,
      customBranding: true,
      apiAccess: true,
      multiBranch: true,
      maxBranches: 5,
      deliveryAreas: true,
      operatingHours: true,
      customDomain: true,
      prioritySupport: true
    },
    description: 'Multi-branch restaurants with advanced features',
    descriptionUrdu: 'Multi-branch restaurants k liye'
  },
  
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise Plan',
    nameUrdu: 'Enterprise Plan',
    price: 18500,
    currency: 'PKR',
    interval: 'month',
    popular: false,
    active: false,
    features: {
      maxRestaurants: -1,
      maxMenuItems: -1,
      maxOrdersPerMonth: -1,
      maxDeals: -1,
      whatsappBot: true,
      whatsappBot24x7: true,
      orderManagement: true,
      bulkMenuUpload: true,
      bulkUploadFormats: ['csv', 'pdf', 'json'],
      analytics: 'enterprise',
      customerSupport: 'dedicated_manager',
      marketing: true,
      aiMarketing: true,
      aiMarketingAdsPerMonth: -1,
      reservations: true,
      feedback: true,
      broadcastMessages: true,
      maxBroadcastsPerMonth: -1,
      logoUpload: true,
      customBranding: true,
      apiAccess: true,
      multiBranch: true,
      maxBranches: -1,
      deliveryAreas: true,
      operatingHours: true,
      customDomain: true,
      prioritySupport: true,
      dedicatedServer: true,
      sla: true,
      whiteLabel: true,
      training: true
    },
    description: 'Large chains with dedicated infrastructure',
    descriptionUrdu: 'Bare restaurant chains k liye'
  }
};

const PAYMENT_METHODS = {
  jazzcash: {
    id: 'jazzcash',
    name: 'JazzCash',
    active: true,
    icon: 'mobile-alt'
  },
  easypaisa: {
    id: 'easypaisa',
    name: 'EasyPaisa',
    active: true,
    icon: 'wallet'
  },
  bank: {
    id: 'bank',
    name: 'Bank Transfer',
    active: true,
    icon: 'university'
  }
};

module.exports = {
  PRICING_PLANS,
  PAYMENT_METHODS,
  getPlan: (planId) => PRICING_PLANS[planId] || null,
  getActivePlans: () => Object.values(PRICING_PLANS).filter(p => p.active),
  hasFeature: (planId, feature) => {
    const plan = PRICING_PLANS[planId];
    if (!plan) return false;
    return plan.features[feature] === true || 
           (typeof plan.features[feature] === 'number' && plan.features[feature] !== 0);
  },
  getLimit: (planId, feature) => {
    const plan = PRICING_PLANS[planId];
    if (!plan) return 0;
    return plan.features[feature] || 0;
  }
};
