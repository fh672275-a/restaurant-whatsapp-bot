/**
 * AI Agent - z-ai-web-dev-sdk integration
 * 
 * Works in 2 modes:
 * 1. With .z-ai-config file (local dev)
 * 2. With environment variables (Railway/production)
 * 
 * If AI fails, falls back to rule-based responses
 * Bot ALWAYS responds - never leaves customer hanging
 */

let zaiInstance = null;
let aiInitialized = false;
let aiAvailable = false;

async function getZAI() {
  if (zaiInstance) return zaiInstance;
  
  try {
    const ZAI = require('z-ai-web-dev-sdk').default;
    
    // Try to create instance - it will auto-load .z-ai-config
    zaiInstance = await ZAI.create();
    aiInitialized = true;
    aiAvailable = true;
    console.log('[AI] z-ai SDK initialized successfully');
    return zaiInstance;
  } catch (e) {
    console.log('[AI] z-ai SDK not available:', e.message);
    console.log('[AI] Using fallback responses instead');
    aiInitialized = true;
    aiAvailable = false;
    return null;
  }
}

/**
 * Check if AI is available
 */
function isAIAvailable() {
  return aiAvailable;
}

/**
 * Generate AI response - with 100% fallback
 */
async function generateResponse(restaurant, customer, customerMessage, context = {}) {
  try {
    const zai = await getZAI();
    
    if (!zai || !aiAvailable) {
      // AI not available - use fallback
      return getFallbackResponse(customerMessage, context);
    }
    
    const systemPrompt = buildSystemPrompt(restaurant, customer, context);
    
    const messages = [
      { role: 'assistant', content: systemPrompt }
    ];
    
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      const recentHistory = context.conversationHistory.slice(-10);
      recentHistory.forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });
    }
    
    messages.push({
      role: 'user',
      content: customerMessage
    });

    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
      temperature: 0.7,
      max_tokens: 200
    });

    const response = completion.choices[0]?.message?.content;
    
    if (!response || response.trim().length === 0) {
      return getFallbackResponse(customerMessage, context);
    }
    
    return response.trim();
  } catch (error) {
    console.error('[AI] generateResponse error:', error.message);
    return getFallbackResponse(customerMessage, context);
  }
}

/**
 * Build system prompt
 */
function buildSystemPrompt(restaurant, customer, context) {
  const {
    menuItems = [],
    deals = [],
    isOpen = true,
    cart = []
  } = context;

  let menuSummary = 'No menu items yet';
  if (menuItems.length > 0) {
    menuSummary = menuItems.slice(0, 20).map(m => `${m.name} (Rs. ${m.price})`).join(', ');
  }

  let cartSummary = '';
  if (cart.length > 0) {
    const subtotal = cart.reduce((s, i) => s + (i.qty * i.price), 0);
    cartSummary = `\n\nCART:\n${cart.map(i => `${i.qty}x ${i.name} - Rs. ${i.qty * i.price}`).join('\n')}\nSubtotal: Rs. ${subtotal}`;
  }

  return `You are ${restaurant.name}'s WhatsApp agent. Reply in Roman Urdu/English (Pakistani style). Keep it SHORT (1-3 lines). Use 1-2 emojis. Be warm and friendly.

Restaurant: ${restaurant.name}
Status: ${isOpen ? 'OPEN' : 'CLOSED'}
Menu: ${menuSummary}
${cartSummary}

Customer: ${customer?.name || 'New customer'}
Message: Help them naturally.`;
}

/**
 * 100% Fallback response - ALWAYS returns something
 */
function getFallbackResponse(message, context = {}) {
  const lower = (message || '').toLowerCase().trim();
  const cart = context.cart || [];
  const isOpen = context.isOpen !== false;
  
  // Empty message
  if (!lower) {
    return 'Bataiye, kya help karoon? 😊\n\n*menu* - menu dekhein\n*order* - order karein';
  }
  
  // Greetings
  if (/^(salam|assalam|assalamualaikum|assalam o alaikum|salaam|hi+|hello+|hey+|yo|aoa|hola|adab)/.test(lower)) {
    const greetings = [
      `Assalam o Alaikum! 🌟 ${context.restaurant?.name || 'Restaurant'} mein khush aamdeed! Bataiye kya khilaoon? 😊`,
      `Walaikum salam! 🌟 Khush aamdeed! Menu dekhne k liye "menu" likhein ya seedha order bata dein! 😊`,
      `Adab! 🌟 Aap ka swagat hai! Kya order karna chahenge? 😊`
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  
  // How are you
  if (/(kaise? ho|kya haal|how are you|kaisa hai)/.test(lower)) {
    return 'Alhamdulillah, bilkul theek! 😊 Aap sunayein? Kya khilaoon?';
  }
  
  // Thanks
  if (/(shukriya|shukar|thank|thanks|thx)/.test(lower)) {
    return 'Aray nahi, thank you toh aap ka! 😊 Aur kuch chahiye?';
  }
  
  // Goodbye
  if (/(allah hafiz|khuda hafiz|bye|goodbye|take care)/.test(lower)) {
    return 'Allah hafiz! 🌙 Phir milte hain! Dobara aana! 😊';
  }
  
  // Menu
  if (/^(menu|cart|items|kya hai|kya kya|list)/.test(lower) || lower === 'menu') {
    if (!isOpen) return `Maaf kijiye, restaurant abhi band hai. 😔\n\nKhulne ka waqt check karein!`;
    
    const menuItems = context.menuItems || [];
    if (menuItems.length === 0) {
      return 'Menu abhi update nahi hua. 😅\nThodi der baad try karein!';
    }
    
    let msg = `🍽️ ${context.restaurant?.name || 'Menu'} 🍽️\n\n`;
    const categories = {};
    menuItems.forEach(item => {
      const cat = item.category_name || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(`• ${item.name} - Rs. ${item.price}`);
    });
    
    Object.entries(categories).forEach(([cat, items]) => {
      msg += `*${cat}*\n${items.join('\n')}\n\n`;
    });
    
    msg += `Order k liye item naam likhein!\nExample: "2x Chicken Biryani" 😊`;
    return msg;
  }
  
  // Order
  if (/^(order|new order|place order|kar do order)/.test(lower)) {
    if (!isOpen) return `Maaf kijiye, restaurant abhi band hai. 😔`;
    return `Bilkul! 🛒 Bataiye kya order karna hai?\n\nItem likhein jaise:\n"Chicken Biryani 2"\n"2x Burger"\n\nJab ho jaye toh "done" likhein! 😊`;
  }
  
  // Status
  if (/^(status|order kya hua|kahan hai|track)/.test(lower)) {
    return 'Aap ka last order status check karne k liye thoda wait karein, ya "menu" likh kar naya order karein! 😊';
  }
  
  // Cancel
  if (/^(cancel|cancel karo|cancel kar do|nahi chahiye)/.test(lower)) {
    return 'Theek hai, cancel kar diya. 🙏 Kuch aur chahiye toh bataiye!';
  }
  
  // Done/checkout
  if (/^(done|ho gaya|bas itna|finish|complete|checkout)/.test(lower)) {
    if (cart.length === 0) return 'Cart khaali hai! Pehle kuch add karein. 😊';
    
    let msg = `Aap ka Cart 🛒\n\n`;
    let subtotal = 0;
    cart.forEach((item, i) => {
      msg += `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n`;
      subtotal += item.qty * item.price;
    });
    msg += `\nSubtotal: Rs. ${subtotal}\n\nDelivery (1) ya Pickup (2)?`;
    return msg;
  }
  
  // Delivery
  if (lower === '1' || lower.includes('deliver')) {
    return 'Aap ka naam bataiye? 😊';
  }
  
  // Pickup
  if (lower === '2' || lower.includes('pickup') || lower.includes('pick')) {
    return 'Aap ka naam bataiye? 😊';
  }
  
  // Confirm
  if (/^(confirm|yes|haan|ok|okay|theek|pakka|kar do|karein)/.test(lower)) {
    return 'Order confirm ho gaya! 🎉 Restaurant ko bhej diya. Shukriya! 😊';
  }
  
  // Hours
  if (/(hours|timing|khulta|band|kya waqt|open|close|kab khulta)/.test(lower)) {
    return 'Hum subah 11 baje se raat 11 baje tak khule hain. ⏰ Har roz!';
  }
  
  // Address
  if (/(address|location|kahan|where)/.test(lower)) {
    return `Humara address: ${context.restaurant?.address || 'Address available nahi'} 📍`;
  }
  
  // Payment
  if (/(payment|cash|card|easypaisa|jazzcash|pay)/.test(lower)) {
    return 'Payment k liye:\n💵 Cash on Delivery\n📱 EasyPaisa/JazzCash\n\nOrder k time bata dijiye! 😊';
  }
  
  // Try to match menu item
  const menuItems = context.menuItems || [];
  const matchedItem = menuItems.find(m => 
    lower.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(lower)
  );
  
  if (matchedItem) {
    return `${matchedItem.name} - Rs. ${matchedItem.price} ✅\n\nCart mein add kar diya! Aur kuch? Ya "done" likhein! 😊`;
  }
  
  // Default fallback - NEVER leave customer without response
  const defaults = [
    `Bataiye, kya help karoon? 😊\n\n*menu* - menu dekhein\n*order* - order karein`,
    `Samajh gaya! 😊 Kya order karna chahenge? "menu" likh kar menu dekh lein!`,
    `Theek hai! 😊 Menu dekhne k liye "menu", order karne k liye item ka naam likhein!`,
    `Ji bataiye! 😊 Kuch order karna hai? "menu" likhein!`
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

/**
 * Parse customer message for order details
 */
async function parseCustomerMessage(message, menuItems, cart = []) {
  try {
    const zai = await getZAI();
    
    if (!zai || !aiAvailable) {
      // AI not available - use basic parsing
      return basicParseMessage(message, menuItems, cart);
    }
    
    const menuSummary = menuItems.map(m => `${m.name} (Rs. ${m.price})`).join(', ');
    
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: `Parse customer message. Return ONLY JSON:
{"action":"add_items|checkout|confirm|cancel|chat","items":[{"name":"item","qty":1}],"order_type":"delivery|pickup|null","customer_name":"string|null","customer_phone":"string|null","customer_address":"string|null","wants_to_checkout":false,"wants_to_confirm":false,"wants_to_cancel":false}

Menu: ${menuSummary}`
        },
        { role: 'user', content: message }
      ],
      thinking: { type: 'disabled' },
      temperature: 0,
      max_tokens: 300
    });

    let response = completion.choices[0]?.message?.content?.trim();
    if (response.includes('```')) {
      response = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }
    
    const parsed = JSON.parse(response);
    
    // Match items
    if (parsed.items && Array.isArray(parsed.items)) {
      const matchedItems = [];
      for (const item of parsed.items) {
        const menuItem = menuItems.find(m => 
          m.name.toLowerCase() === item.name.toLowerCase() ||
          m.name.toLowerCase().includes(item.name.toLowerCase()) ||
          item.name.toLowerCase().includes(m.name.toLowerCase())
        );
        if (menuItem) {
          matchedItems.push({
            item_id: menuItem.id,
            name: menuItem.name,
            price: menuItem.price,
            qty: Math.min(Math.max(item.qty || 1, 1), 20)
          });
        }
      }
      parsed.items = matchedItems;
    } else {
      parsed.items = [];
    }
    
    if (parsed.customer_phone) {
      parsed.customer_phone = parsed.customer_phone.replace(/[^0-9]/g, '');
    }
    
    return parsed;
  } catch (error) {
    console.error('[AI] parseCustomerMessage error:', error.message);
    return basicParseMessage(message, menuItems, cart);
  }
}

/**
 * Basic message parser (no AI) - 100% reliable
 */
function basicParseMessage(message, menuItems, cart = []) {
  const lower = message.toLowerCase().trim();
  
  const result = {
    action: 'chat',
    items: [],
    order_type: null,
    customer_name: null,
    customer_phone: null,
    customer_address: null,
    wants_to_checkout: false,
    wants_to_confirm: false,
    wants_to_cancel: false
  };
  
  // Cancel
  if (/^(cancel|cancel karo|nahi chahiye|rok do)/.test(lower)) {
    result.action = 'cancel';
    result.wants_to_cancel = true;
    return result;
  }
  
  // Confirm
  if (/^(confirm|yes|haan|ok|okay|theek|pakka|kar do|karein|ho jaye)/.test(lower)) {
    result.action = 'confirm';
    result.wants_to_confirm = true;
    return result;
  }
  
  // Done/checkout
  if (/^(done|ho gaya|bas itna|finish|complete|checkout|bas kafi)/.test(lower)) {
    result.action = 'checkout';
    result.wants_to_checkout = true;
    return result;
  }
  
  // Delivery
  if (lower === '1' || lower.includes('deliver')) {
    result.order_type = 'delivery';
    result.action = 'add_items';
    return result;
  }
  
  // Pickup
  if (lower === '2' || lower.includes('pickup') || lower.includes('pick')) {
    result.order_type = 'pickup';
    result.action = 'add_items';
    return result;
  }
  
  // Try to find menu items
  let foundItems = [];
  for (const menuItem of menuItems) {
    const itemName = menuItem.name.toLowerCase();
    if (lower.includes(itemName) || itemName.includes(lower)) {
      // Find quantity
      let qty = 1;
      const qtyMatch = message.match(/(\d+)\s*x/i) || message.match(/x\s*(\d+)/i);
      if (qtyMatch) {
        qty = Math.min(parseInt(qtyMatch[1]), 20);
      } else {
        const numMatch = message.match(/(\d+)/);
        if (numMatch) qty = Math.min(parseInt(numMatch[1]), 20);
      }
      
      foundItems.push({
        item_id: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        qty: qty
      });
    }
  }
  
  if (foundItems.length > 0) {
    result.action = 'add_items';
    result.items = foundItems;
  }
  
  // Try to extract phone number
  const phoneMatch = message.match(/(\+?92|0)?(3\d{9})/);
  if (phoneMatch) {
    result.customer_phone = phoneMatch[0].replace(/[^0-9]/g, '');
  }
  
  // Try to extract name (basic heuristic)
  const nameMatch = message.match(/(?:name|naam|mera naam)\s*:?\s*([a-zA-Z\s]{3,30})/i);
  if (nameMatch) {
    result.customer_name = nameMatch[1].trim();
  }
  
  return result;
}

module.exports = {
  generateResponse,
  getFallbackResponse,
  parseCustomerMessage,
  basicParseMessage,
  buildSystemPrompt,
  isAIAvailable,
  getZAI
};
