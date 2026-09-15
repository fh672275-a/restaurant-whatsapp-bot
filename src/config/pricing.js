/**
 * Pricing Plans - FINAL Configuration
 * 
 * Starter: Basic features
 * Pro: Mid-tier (NO Feedback, Broadcast, Multi-branch, Priority support)
 * Business: Advanced (most features)
 * Enterprise: EVERYTHING enabled (no exceptions)
 * 
 * Exclusive Enterprise features (researched for Pakistan market):
 * - Loyalty program (repeat customers)
 * - QR code table ordering
 * - Inventory management
 * - Staff management
 * - POS integration
 * - Tax invoicing
 * - SMS notifications
 * - White-label solution
 * - Custom branding
 * - API access
 * - Multi-branch unlimited
 * - Dedicated server
 * - SLA guarantee
 * - Training sessions
 * - Priority support 24/7
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
      logoUpload: true,
      // NOT in Starter:
      reservations: false,
      feedback: false,
      broadcastMessages: false,
      multiBranch: false,
      prioritySupport: false,
      customBranding: false,
      apiAccess: false,
      // Enterprise exclusive - NOT here
      loyaltyProgram: false,
      qrTableOrdering: false,
      inventoryManagement: false,
      staffManagement: false,
      posIntegration: false,
      taxInvoicing: false,
      smsNotifications: false,
      whiteLabel: false,
      dedicatedServer: false,
      sla: false,
      training: false
    },
    description: 'Single restaurant starting up'
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
      logoUpload: true,
      deliveryAreas: true,
      operatingHours: true,
      // NOT in Pro (as requested):
      reservations: false,
      feedback: false,
      broadcastMessages: false,
      multiBranch: false,
      prioritySupport: false,
      // Enterprise exclusive - NOT here:
      loyaltyProgram: false,
      qrTableOrdering: false,
      inventoryManagement: false,
      staffManagement: false,
      posIntegration: false,
      taxInvoicing: false,
      smsNotifications: false,
      whiteLabel: false,
      dedicatedServer: false,
      sla: false,
      training: false
    },
    description: 'Most popular - growing restaurants'
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
      maxDeals: -1,
      whatsappBot: true,
      bulkMenuUpload: true,
      analytics: 'advanced',
      marketing: true,
      aiMarketing: true,
      aiMarketingAdsPerMonth: 200,
      logoUpload: true,
      customBranding: true,
      deliveryAreas: true,
      operatingHours: true,
      // In Business:
      reservations: true,
      feedback: true,
      broadcastMessages: true,
      multiBranch: true,
      maxBranches: 5,
      prioritySupport: true,
      // Enterprise exclusive - NOT here:
      loyaltyProgram: false,
      qrTableOrdering: false,
      inventoryManagement: false,
      staffManagement: false,
      posIntegration: false,
      taxInvoicing: false,
      smsNotifications: false,
      whiteLabel: false,
      dedicatedServer: false,
      sla: false,
      training: false
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
      // ALL features enabled - no exceptions
      maxRestaurants: -1,
      maxMenuItems: -1,
      maxOrdersPerMonth: -1,
      maxDeals: -1,
      whatsappBot: true,
      bulkMenuUpload: true,
      analytics: 'enterprise',
      marketing: true,
      aiMarketing: true,
      aiMarketingAdsPerMonth: -1,
      logoUpload: true,
      customBranding: true,
      deliveryAreas: true,
      operatingHours: true,
      reservations: true,
      feedback: true,
      broadcastMessages: true,
      multiBranch: true,
      maxBranches: -1,
      prioritySupport: true,
      apiAccess: true,
      // Enterprise EXCLUSIVE features (Pakistan market research):
      loyaltyProgram: true,           // Repeat customer points/discounts
      qrTableOrdering: true,           // QR code on tables for direct ordering
      inventoryManagement: true,      // Track stock, auto-alert when low
      staffManagement: true,          // Manage staff shifts, roles, permissions
      posIntegration: true,           // Connect with POS systems
      taxInvoicing: true,             // Generate tax invoices (FBR compliant)
      smsNotifications: true,        // SMS alerts for orders
      whiteLabel: true,               // Your brand, your domain
      dedicatedServer: true,          // Dedicated server resources
      sla: true,                      // Service Level Agreement
      training: true,                 // Staff training sessions
      customDomain: true,
      customReports: true,            // Custom analytics reports
      multiCurrency: true,            // Accept payments in multiple currencies
      advancedSecurity: true,         // Advanced security features
      backupRestore: true,            // Automated backups
      apiWebhooks: true,              // Webhook integrations
      voiceOrdering: true,            // Voice-based ordering (AI)
      multiLanguage: true,            // Multi-language support
      franchiseMode: true,            // Franchise management
      customerApp: true,              // White-label customer app
      deliveryBoyApp: true,           // Delivery boy management app
      tableManagement: true,          // Table reservation management
      kitchenDisplay: true,           // Kitchen display system
      recipeManagement: true,         // Recipe/ingredient management
      supplierManagement: true,       // Supplier tracking
      expenseTracking: true,          // Expense management
      payrollManagement: true         // Staff payroll
    },
    description: 'Everything unlocked - large chains & franchises'
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
