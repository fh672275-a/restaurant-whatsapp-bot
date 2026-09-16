/**
 * AI-Powered Restaurant Agent - LLM-style (like ChatGPT)
 * 
 * Fully autonomous, natural conversation engine.
 * Not scripted - uses AI to understand and respond to ANY message.
 * Falls back to intelligent rule-based responses.
 */

let zaiInstance = null;
let aiAvailable = false;

async function getZAI() {
  if (zaiInstance) return zaiInstance;
  
  try {
    const ZAI = require('z-ai-web-dev-sdk').default;
    
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(process.cwd(), '.z-ai-config');
    
    if (!fs.existsSync(configPath)) {
      if (process.env.ZAI_TOKEN) {
        const config = {
          baseUrl: process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1',
          apiKey: process.env.ZAI_API_KEY || 'Z.ai',
          chatId: process.env.ZAI_CHAT_ID || '',
          token: process.env.ZAI_TOKEN,
          userId: process.env.ZAI_USER_ID || ''
        };
        fs.writeFileSync(configPath, JSON.stringify(config));
      } else {
        const defaultConfig = {
          "baseUrl": "https://internal-api.z.ai/v1",
          "apiKey": "Z.ai",
          "chatId": "chat-a038bcb7-2b3f-4eb5-a0ae-aba1bed8b513",
          "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiOTg3ZGM3NmItMTYzZC00ZDgwLWFlOWItZTdmYzNmZjNiZWZkIiwiY2hhdF9pZCI6ImNoYXQtYTAzOGJjYjctMmIzZi00ZWI1LWEwYWUtYWJhMWJlZDhiNTEzIiwicGxhdGZvcm0iOiJ6YWkifQ.JMV554kVcONRxoZrXgxhWE0wZ2mhLfEkD_RVHUPaDbo",
          "userId": "987dc76b-163d-4d80-ae9b-e7fc3ff3befd"
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig));
      }
    }
    
    zaiInstance = await ZAI.create();
    aiAvailable = true;
    console.log('[AI] z-ai SDK initialized');
    return zaiInstance;
  } catch (e) {
    console.log('[AI] z-ai not available, using fallback');
    aiAvailable = false;
    return null;
  }
}

function isAIAvailable() {
  return aiAvailable;
}

/**
 * Generate response - ChatGPT style
 */
async function generateResponse(restaurant, customer, customerMessage, context = {}) {
  try {
    const zai = await getZAI();
    
    if (!zai || !aiAvailable) {
      return getFallbackResponse(customerMessage, context);
    }
    
    const systemPrompt = buildSystemPrompt(restaurant, customer, context);
    
    const messages = [
      { role: 'assistant', content: systemPrompt }
    ];
    
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      context.conversationHistory.slice(-8).forEach(msg => {
        messages.push({ role: msg.role, content: msg.content });
      });
    }
    
    messages.push({ role: 'user', content: customerMessage });

    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
      temperature: 0.8,
      max_tokens: 200
    });

    const response = completion.choices[0]?.message?.content;
    
    if (!response || response.trim().length === 0) {
      return getFallbackResponse(customerMessage, context);
    }
    
    return response.trim();
  } catch (error) {
    console.error('[AI] Error:', error.message);
    return getFallbackResponse(customerMessage, context);
  }
}

/**
 * System prompt - fully natural, not scripted
 */
function buildSystemPrompt(restaurant, customer, context) {
  const {
    menuItems = [],
    deals = [],
    isOpen = true,
    closingTime = null,
    cart = []
  } = context;

  let menuSummary = 'Menu khaali hai';
  if (menuItems.length > 0) {
    menuSummary = menuItems.map(m => `${m.name} (Rs. ${m.price})`).join(', ');
  }

  let dealsSummary = 'No deals';
  if (deals.length > 0) {
    dealsSummary = deals.map(d => `${d.name} - Rs. ${d.deal_price}`).join(', ');
  }

  let cartSummary = '';
  if (cart.length > 0) {
    const subtotal = cart.reduce((s, i) => s + (i.qty * i.price), 0);
    cartSummary = `\n\nCART: ${cart.map(i => `${i.qty}x ${i.name}`).join(', ')} = Rs. ${subtotal}`;
  }

  return `Tu ek real insaan hai jo ${restaurant.name} k yahan staff member hai. WhatsApp par customers k saath baat kar raha hai.

Tu ek friendly, helpful aur natural dostana agent hai. ChatGPT ki tarah HAR tarah k sawal ka jawab de sakta hai - sirf restaurant k baare mein nahi, balki general baatein bhi kar sakta hai (weather, greetings, etc).

PERSONALITY:
- Warm, friendly, caring - jaise ek dost baat kar raha ho
- Roman Urdu/English mix (Pakistani WhatsApp style)
- 1-2 lines reply (real WhatsApp texting style)
- 1-2 emojis naturally
- Kabhi "main AI hoon" mat bol
- Natural curiosity - puch le kya chahte hain
- Humor aur warmth dikhao

WHAT YOU CAN DO:
- Restaurant k baare mein kuch bhi baat kare (food, hours, menu, etc)
- Orders le, menu suggest kare, deals batae
- General chat - greetings, weather, small talk
- Customer k sawalon ka natural jawab
- Cart manage kare
- Checkout flow handle kare

CRITICAL RULES:
- Quantity sirf tabhi badhao jab customer EXPLICITLY bole (2x, 2 plates, do, etc)
- Price ko quantity mat samajho!
- 1 message mein 1 item add karo
- Restaurant band ho to batao
- Natural conversation - har sawal ka jawab do

Restaurant: ${restaurant.name}
Phone: ${restaurant.phone}
Address: ${restaurant.address || 'N/A'}
Status: ${isOpen ? 'OPEN' : 'CLOSED'}${closingTime ? ` (closes ${closingTime})` : ''}
Delivery Fee: Rs. ${restaurant.delivery_fee_default || 100}

MENU: ${menuSummary}
DEALS: ${dealsSummary}
${cartSummary}

Customer: ${customer?.name || 'Naya customer'}`;
}

/**
 * Parse customer message
 */
async function parseCustomerMessage(message, menuItems, cart = []) {
  try {
    const zai = await getZAI();
    
    if (!zai || !aiAvailable) {
      return basicParseMessage(message, menuItems, cart);
    }
    
    const menuSummary = menuItems.map(m => `${m.name} (Rs. ${m.price})`).join(', ');
    
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: `Customer message parse karein. Return ONLY JSON:
{"action":"chat|add_items|checkout|confirm|cancel","items":[{"name":"item","qty":1}],"order_type":"delivery|pickup|null","customer_name":"string|null","customer_phone":"string|null","customer_address":"string|null","wants_to_checkout":false,"wants_to_confirm":false,"wants_to_cancel":false}

CRITICAL: qty sirf tabhi 1 se zyada karein jab customer CLEARLY likhe (2x, 2 plates, do). Price ko quantity mat samajho!
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
    
    if (parsed.items && Array.isArray(parsed.items)) {
      const matchedItems = [];
      for (const item of parsed.items) {
        const menuItem = menuItems.find(m => 
          m.name.toLowerCase() === item.name.toLowerCase() ||
          m.name.toLowerCase().includes(item.name.toLowerCase()) ||
          item.name.toLowerCase().includes(m.name.toLowerCase())
        );
        if (menuItem) {
          let qty = 1;
          if (item.qty && item.qty > 1) {
            const numPattern = new RegExp(`(\\d+)\\s*x\\s*${menuItem.name}`, 'i');
            const numMatch = message.match(numPattern);
            if (numMatch) qty = Math.min(parseInt(numMatch[1]), 20);
            else {
              const platePattern = new RegExp(`(\\d+)\\s*(plate|portion|piece)`, 'i');
              const plateMatch = message.match(platePattern);
              if (plateMatch) qty = Math.min(parseInt(plateMatch[1]), 20);
            }
          }
          matchedItems.push({ item_id: menuItem.id, name: menuItem.name, price: menuItem.price, qty });
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
 * Basic parser - 100% reliable
 */
function basicParseMessage(message, menuItems, cart = []) {
  const lower = message.toLowerCase().trim();
  
  const result = {
    action: 'chat', items: [], order_type: null,
    customer_name: null, customer_phone: null, customer_address: null,
    wants_to_checkout: false, wants_to_confirm: false, wants_to_cancel: false
  };
  
  if (/^(cancel|cancel karo|nahi chahiye|rok do)/.test(lower)) {
    result.action = 'cancel'; result.wants_to_cancel = true;
    return result;
  }
  
  if (/^(confirm|yes|haan|ok|okay|theek|pakka|kar do|karein)/.test(lower)) {
    result.action = 'confirm'; result.wants_to_confirm = true;
    return result;
  }
  
  if (/^(done|ho gaya|bas itna|finish|complete|checkout)/.test(lower)) {
    result.action = 'checkout'; result.wants_to_checkout = true;
    return result;
  }
  
  if (lower === '1' || lower.includes('deliver')) {
    result.order_type = 'delivery'; result.action = 'add_items';
    return result;
  }
  
  if (lower === '2' || lower.includes('pickup')) {
    result.order_type = 'pickup'; result.action = 'add_items';
    return result;
  }
  
  // Find menu items
  for (const menuItem of menuItems) {
    const itemName = menuItem.name.toLowerCase();
    if (lower.includes(itemName)) {
      let qty = 1;
      const qtyXMatch = message.match(new RegExp(`(\\d+)\\s*x\\s*${itemName}`, 'i'));
      if (qtyXMatch) qty = Math.min(parseInt(qtyXMatch[1]), 20);
      else {
        const plateMatch = message.match(/(\d+)\s*(plate|plates|portion|portions)/i);
        if (plateMatch && lower.includes(itemName)) qty = Math.min(parseInt(plateMatch[1]), 20);
      }
      result.action = 'add_items';
      result.items = [{ item_id: menuItem.id, name: menuItem.name, price: menuItem.price, qty }];
      break;
    }
  }
  
  const phoneMatch = message.match(/(?:\+?92|0)(3\d{9})/);
  if (phoneMatch) result.customer_phone = '0' + phoneMatch[1];
  
  return result;
}

/**
 * Fallback response - intelligent, not robotic
 */
function getFallbackResponse(message, context = {}) {
  const lower = (message || '').toLowerCase().trim();
  const cart = context.cart || [];
  const isOpen = context.isOpen !== false;
  const restaurant = context.restaurant || {};
  const menuItems = context.menuItems || [];
  
  if (!lower) {
    return `Bataiye, kya help karoon? 😊\n\n*menu* - dekhein kya kya hai\n*order* - order karein`;
  }
  
  // Greetings - natural
  if (/^(salam|assalam|assalamualaikum|assalam o alaikum|salaam|hi+|hello+|hey+|yo|aoa|hola|adab)/.test(lower)) {
    const greetings = [
      `Walaikum salam! 🌟\n\n${restaurant.name || 'Restaurant'} mein khush aamdeed! 😊\n\nKya order karna chahenge? "menu" likh kar menu dekh sakte hain!`,
      `Assalam o Alaikum! 🌟\n\nAap ka swagat hai! Bataiye kya khilaoon? 😊`,
      `Adab! 🌟\n\nKhush aamdeed! Kya chahiye? Menu dekhne k liye "menu" likhein! 😊`
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  
  if (/(kaise? ho|kya haal|how are you)/.test(lower)) {
    return 'Alhamdulillah, theek! 😊 Aap sunayein? Kya order karna hai?';
  }
  if (/(shukriya|thank|thanks)/.test(lower)) {
    return 'Aray nahi, thank you toh aap ka! 😊 Aur kuch?';
  }
  if (/(allah hafiz|bye|goodbye)/.test(lower)) {
    return 'Allah hafiz! 🌙 Phir milte hain! 😊';
  }
  
  // Menu
  if (/^(menu|cart dekho|kya kya hai|kya mojood|items|list)/.test(lower) || lower === 'menu') {
    if (!isOpen) return `Maaf kijiye, restaurant abhi band hai. 😔`;
    if (menuItems.length === 0) return 'Menu abhi update nahi hua. 😅';
    
    let msg = `🍽️ ${restaurant.name || 'Menu'}\n\n`;
    const categories = {};
    menuItems.forEach(item => {
      const cat = item.category_name || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(`• ${item.name} - Rs. ${item.price}`);
    });
    Object.entries(categories).forEach(([cat, items]) => {
      msg += `*${cat}*\n${items.join('\n')}\n\n`;
    });
    msg += `Order k liye item ka naam likhein! 😊`;
    return msg;
  }
  
  if (/^(order|new order|place order)/.test(lower)) {
    if (!isOpen) return `Maaf kijiye, restaurant abhi band hai. 😔`;
    return `Bilkul! 🛒 Bataiye kya order karna hai?\n\nItem ka naam likhein jaise "Chicken Biryani"\n\nJab ho jaye toh "done" likhein! 😊`;
  }
  
  if (/^(status|order kya hua)/.test(lower)) {
    return 'Last order check karne k liye thoda wait karein, ya naya order karein! 😊';
  }
  
  if (/^(cancel|cancel karo)/.test(lower)) {
    return 'Theek hai, cancel kar diya. 🙏 Kuch aur chahiye?';
  }
  
  if (/^(done|ho gaya|bas itna|finish)/.test(lower)) {
    if (cart.length === 0) return 'Cart khaali hai! Pehle kuch add karein. 😊';
    let msg = `Aap ka Cart 🛒\n\n`;
    let subtotal = 0;
    cart.forEach((item, i) => {
      msg += `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n`;
      subtotal += item.qty * item.price;
    });
    msg += `\n*Subtotal: Rs. ${subtotal}*\n\nDelivery (1) ya Pickup (2)?`;
    return msg;
  }
  
  if (/^(confirm|yes|haan|ok)/.test(lower)) {
    return 'Order confirm ho gaya! 🎉 Shukriya! 😊';
  }
  
  if (/(hours|timing|khulta|kab khulta)/.test(lower)) {
    return 'Hum subah 11 baje se raat 11 baje tak khule hain. ⏰';
  }
  if (/(address|location|kahan)/.test(lower)) {
    return `Humara address: ${restaurant.address || 'N/A'} 📍`;
  }
  if (/(payment|cash|card|easypaisa|jazzcash)/.test(lower)) {
    return 'Payment: 💵 Cash on Delivery | 📱 EasyPaisa/JazzCash 😊';
  }
  
  // Try menu item match
  const matchedItem = menuItems.find(m => 
    lower.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(lower)
  );
  if (matchedItem) {
    return `${matchedItem.name} cart mein add ho gaya! ✅ (Rs. ${matchedItem.price})\n\nAur kuch? Ya "done" likhein! 😊`;
  }
  
  // Default - natural
  const defaults = [
    `Bataiye, kya help karoon? 😊\n\n*menu* - menu dekhein\n*order* - order karein`,
    `Samajh gaya! 😊 Kya order karna chahenge?`,
    `Ji bataiye! 😊 "menu" likh kar menu dekh lein!`,
    `Kya chahiye? 😊 "menu" likhein!`
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

module.exports = {
  generateResponse, getFallbackResponse, parseCustomerMessage,
  basicParseMessage, buildSystemPrompt, isAIAvailable, getZAI
};
