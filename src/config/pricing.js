/**
 * Pricing Plans - FINAL (3 billing modes)
 * Monthly + Yearly (2 months free) + One-time (lifetime)
 */

const PRICING_PLANS = {
  starter: {
    id: 'starter', name: 'Starter Plan', popular: false, active: true, freeTrialDays: 3,
    monthly: 3000, yearly: 30000, oneTime: 15000,
    features: {
      maxRestaurants: 1, maxMenuItems: -1, maxOrdersPerMonth: 500, maxDeals: 5,
      whatsappBot: true, bulkMenuUpload: true, analytics: 'basic', marketing: false,
      aiMarketing: false, logoUpload: true, reservations: false, feedback: false,
      broadcastMessages: false, multiBranch: false, prioritySupport: false,
      customBranding: false, apiAccess: false, loyaltyProgram: false, qrTableOrdering: false,
      inventoryManagement: false, staffManagement: false, posIntegration: false,
      taxInvoicing: false, smsNotifications: false, whiteLabel: false, dedicatedServer: false,
      sla: false, training: false
    },
    description: 'Single restaurant starting up'
  },
  pro: {
    id: 'pro', name: 'Pro Plan', popular: true, active: true, freeTrialDays: 3,
    monthly: 5000, yearly: 50000, oneTime: 25000,
    features: {
      maxRestaurants: 1, maxMenuItems: -1, maxOrdersPerMonth: -1, maxDeals: -1,
      whatsappBot: true, bulkMenuUpload: true, analytics: 'advanced', marketing: true,
      aiMarketing: true, aiMarketingAdsPerMonth: 50, logoUpload: true, deliveryAreas: true,
      operatingHours: true, reservations: false, feedback: false, broadcastMessages: false,
      multiBranch: false, prioritySupport: false, loyaltyProgram: false, qrTableOrdering: false,
      inventoryManagement: false, staffManagement: false, posIntegration: false,
      taxInvoicing: false, smsNotifications: false, whiteLabel: false, dedicatedServer: false,
      sla: false, training: false
    },
    description: 'Most popular - growing restaurants'
  },
  business: {
    id: 'business', name: 'Business Plan', popular: false, active: true, freeTrialDays: 3,
    monthly: 8500, yearly: 85000, oneTime: 50000,
    features: {
      maxRestaurants: 5, maxMenuItems: -1, maxOrdersPerMonth: -1, maxDeals: -1,
      whatsappBot: true, bulkMenuUpload: true, analytics: 'advanced', marketing: true,
      aiMarketing: true, aiMarketingAdsPerMonth: 200, logoUpload: true, customBranding: true,
      deliveryAreas: true, operatingHours: true, reservations: true, feedback: true,
      broadcastMessages: true, multiBranch: true, maxBranches: 5, prioritySupport: true,
      apiAccess: true, loyaltyProgram: false, qrTableOrdering: false, inventoryManagement: false,
      staffManagement: false, posIntegration: false, taxInvoicing: false, smsNotifications: false,
      whiteLabel: false, dedicatedServer: false, sla: false, training: false
    },
    description: 'Multi-branch restaurants'
  },
  enterprise: {
    id: 'enterprise', name: 'Enterprise Plan', popular: false, active: true, freeTrialDays: 3,
    monthly: 18500, yearly: 185000, oneTime: 100000,
    features: {
      maxRestaurants: -1, maxMenuItems: -1, maxOrdersPerMonth: -1, maxDeals: -1,
      whatsappBot: true, bulkMenuUpload: true, analytics: 'enterprise', marketing: true,
      aiMarketing: true, aiMarketingAdsPerMonth: -1, logoUpload: true, customBranding: true,
      deliveryAreas: true, operatingHours: true, reservations: true, feedback: true,
      broadcastMessages: true, multiBranch: true, maxBranches: -1, prioritySupport: true,
      apiAccess: true, loyaltyProgram: true, qrTableOrdering: true, inventoryManagement: true,
      staffManagement: true, posIntegration: true, taxInvoicing: true, smsNotifications: true,
      whiteLabel: true, dedicatedServer: true, sla: true, training: true, customDomain: true,
      customReports: true, multiCurrency: true, advancedSecurity: true, backupRestore: true,
      apiWebhooks: true, voiceOrdering: true, multiLanguage: true, franchiseMode: true,
      customerApp: true, deliveryBoyApp: true, tableManagement: true, kitchenDisplay: true,
      recipeManagement: true, supplierManagement: true, expenseTracking: true, payrollManagement: true
    },
    description: 'Everything unlocked - large chains & franchises'
  }
};

const PAYMENT_METHODS = {
  easypaisa: { id: 'easypaisa', name: 'EasyPaisa', active: true, accountName: 'Muhammad Ashraf', accountNumber: '03494117212', whatsappNumber: '03494117212' },
  jazzcash: { id: 'jazzcash', name: 'JazzCash', active: true, accountName: 'Muhammad Ashraf', accountNumber: '03494117212', whatsappNumber: '03494117212' }
};

const ADMIN_ACCESS_CODE = 'Joai5663@@';
const EASYPAISA_NUMBER = '03494117212';
const EASYPAISA_NAME = 'Muhammad Ashraf';

module.exports = {
  PRICING_PLANS, PAYMENT_METHODS, ADMIN_ACCESS_CODE, EASYPAISA_NUMBER, EASYPAISA_NAME,
  getPlan: (id) => PRICING_PLANS[id] || null,
  getActivePlans: () => Object.values(PRICING_PLANS).filter(p => p.active),
  hasFeature: (planId, feature) => { const p = PRICING_PLANS[planId]; return p ? p.features[feature] === true : false; },
  getLimit: (planId, feature) => { const p = PRICING_PLANS[planId]; return p ? (p.features[feature] || 0) : 0; }
};
