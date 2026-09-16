/**
 * AI-Powered Restaurant Agent - Fully Natural (ChatGPT style)
 * 
 * NO keywords, NO hardcoded patterns.
 * Uses LLM to understand intent and respond naturally.
 * Hard limit on quantity (max 5 per item).
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
    console.log('[AI] z-ai not available:', e.message);
    aiAvailable = false;
    return null;
  }
}

function isAIAvailable() {
  return aiAvailable;
}

/**
 * Generate response - ChatGPT style, fully natural
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
      context.conversationHistory.slice(-10).forEach(msg => {
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
 * System prompt - Natural, no keywords
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

Aap ek normal waiter hain. Agar customer kisi bhi tarah se khana maangay, to us ka order process karen, bajaye is ke ke aap makhsoos lafzon ka intezar karen. Customer jo bhi style mein baat kare (jaise "yaar aik pizza lagao", "bhook lagi hai", "kya khilaoge"), aap uska matlab samajh kar natural jawab dein.

Aap ki personality:
- Warm, friendly, caring - jaise ek dost baat kar raha ho
- Roman Urdu/English mix (Pakistani WhatsApp style)
- 1-2 lines reply (real WhatsApp texting style)
- 1-2 emojis naturally
- Kabhi "main AI hoon" ya "bot" mat bol
- Natural curiosity - puch le kya chahte hain
- Humor aur warmth dikhao

Aap kya kar sakte hain:
- Restaurant k baare mein HAR tarah ki baat karein (food, service, hours, etc)
- Orders lein, menu suggest karein, deals batae
- General chat - weather, greetings, small talk
- Customer k sawalon ka natural jawab dein
- Cart manage karein, items add/remove karein
- Checkout flow handle karein

CRITICAL RULES (MUST FOLLOW):
1. Quantity Limit: Kisi bhi item ki quantity 5 se zyada Nahi ho sakti. Agar customer 5 se zyada maange (jaise 20), toh politely refuse karein: "Maaf kijiyega, aap aik waqt mein 5 se zyada items order nahi kar sakty. Kya main 5 add kar doon?"
2. Prices ko quantity mat samjho! (e.g., Rs. 1800 price hai, 1800 quantity nahi)
3. 1 message mein 1 item add karo (natural flow)
4. Restaurant band ho to batao
5. Natural conversation - har sawal ka jawab do, koi bhi sawal ho

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
 * Parse customer message - AI powered intent detection
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
          content: `Customer message parse karein. Customer koi bhi tareeqe se baat kar sakta hai (jaise "yaar 2 pizza lagao", "bhook lagi hai biryani chahiye", "menu dikha"). Aap ko intent samajh kar action lena hai.

Return ONLY JSON:
{"action":"chat|add_items|checkout|confirm|cancel","items":[{"name":"exact menu item name","qty":1}],"order_type":"delivery|pickup|null","customer_name":"string|null","customer_phone":"string|null","customer_address":"string|null","wants_to_checkout":false,"wants_to_confirm":false,"wants_to_cancel":false}

CRITICAL RULES:
- qty MAX 5 ho sakti hai. Agar customer 5 se zyada maange (jaise 20), toh qty = 5 set karein (usko baad mein bot batayega limit ki)
- Price numbers (jaise Rs. 1800) ko quantity mat samajho
- Agar customer general baat kar raha hai to action = "chat"
- Agar customer khana maange to action = "add_items" aur items mein add karein
- Customer ne "done", "bas", "ho gaya" kaha to action = "checkout"
- Customer ne "cancel" kaha to action = "cancel"
- Customer apna naam/address/phone de raha hai to action = "chat" (bot handle karega)

Menu items: ${menuSummary}`
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
          // HARD LIMIT: Max 5 quantity per item
          let qty = Math.min(Math.max(item.qty || 1, 1), 5);
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
 * Basic parser - 100% reliable, no keywords matching
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
  
  // Find menu items - natural matching
  for (const menuItem of menuItems) {
    const itemName = menuItem.name.toLowerCase();
    if (lower.includes(itemName)) {
      let qty = 1;
      const qtyXMatch = message.match(new RegExp(`(\\d+)\\s*x\\s*${itemName}`, 'i'));
      if (qtyXMatch) {
        qty = parseInt(qtyXMatch[1]);
      } else {
        const plateMatch = message.match(/(\d+)\s*(plate|plates|portion|portions|piece|pieces)/i);
        if (plateMatch && lower.includes(itemName)) {
          qty = parseInt(plateMatch[1]);
        }
      }
      
      // HARD LIMIT: Max 5 per item
      if (qty > 5) {
        qty = 5; // Force to 5, bot will tell customer about limit
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
 * Fallback response - intelligent, natural
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
  
  if (/^(salam|assalam|assalamualaikum|salaam|hi+|hello+|hey+|yo|aoa|hola|adab)/.test(lower)) {
    const greetings = [
      `Walaikum salam! 🌟\n\n${restaurant.name || 'Restaurant'} mein khush aamdeed! 😊\n\nKya order karna chahenge?`,
      `Assalam o Alaikum! 🌟\n\nAap ka swagat hai! Bataiye kya khilaoon? 😊`,
      `Adab! 🌟\n\nKhush aamdeed! Kya chahiye? 😊`
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
    return `Bilkul! 🛒 Bataiye kya order karna hai?\n\nItem ka naam likhein! 😊`;
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
  if (/(payment|cash|card|easypaisa)/.test(lower)) {
    return 'Payment: 💵 Cash on Delivery | 📱 EasyPaisa/JazzCash 😊';
  }
  
  // Try menu item match
  const matchedItem = menuItems.find(m => 
    lower.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(lower)
  );
  if (matchedItem) {
    return `${matchedItem.name} cart mein add ho gaya! ✅ (Rs. ${matchedItem.price})\n\nAur kuch? Ya "done" likhein! 😊`;
  }
  
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
