/**
 * AI-Powered Restaurant Agent - STRICT RULE-BASED LLM
 * 
 * CRITICAL FIX: Never invents items, never adds items customer didn't order.
 * Natural conversation, context-aware, understands corrections.
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
 * Generate response - STRICT natural conversation
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
      temperature: 0.7,
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
 * System prompt - STRICT RULES
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
    cartSummary = `\n\nCURRENT CART: ${cart.map(i => `${i.qty}x ${i.name} (Rs. ${i.qty * i.price})`).join(', ')} = Rs. ${subtotal}`;
  }

  return `Aap ${restaurant.name} k yahan ek real waiter hain. WhatsApp par customers k saath natural baat kar rahe hain.

=== ABSOLUTE RULES (NEVER BREAK THESE) ===

1. CUSTOMER SAID IT -> CAN BE ORDERED. CUSTOMER DID NOT SAY IT -> DO NOT ADD IT.
2. NEVER invent, assume, guess, or add items customer didn't explicitly request.
3. NEVER add multiple items automatically.
4. NEVER convert suggestions into orders without explicit customer confirmation.
5. Price numbers (Rs. 500) are PRICES, NOT quantities.
6. Default quantity is 1 ONLY if customer clearly wants that item.
7. MAX quantity per item is 5. If customer asks for more, politely refuse.
8. ALWAYS show order summary before final confirmation.
9. Customer corrections have HIGHEST PRIORITY. If customer says "nahi, sirf burger tha", remove everything else.
10. NEVER return to keyword instructions like "menu likhein" when customer is having a conversation.
11. Understand CONTEXT. If customer says "woh wala", refer to previous messages.
12. If unclear, ASK. Never guess.
13. If customer says "remove fries", only remove fries.
14. If customer says "quantity 2 kar do", only change that item's quantity.
15. NEVER manufacture an order. Only record what customer explicitly requested.

=== CONVERSATION STYLE ===

- Natural, human-like conversation (jaise ek real waiter baat kare)
- Roman Urdu/English mix (Pakistani WhatsApp style)
- 1-2 lines reply (short, like real WhatsApp texting)
- 1-2 emojis naturally
- NEVER say "main AI hoon" or "bot"
- NEVER force customer to use keywords like "menu", "order", etc.
- Understand normal language: "kya available hai?", "bhook lagi hai", "ek burger de do"

=== HOW TO HANDLE MENU QUESTIONS ===

If customer asks "kya kya hai?", "menu dikha", "kya available hai", etc:
-> List the actual menu items naturally with prices.
-> Do NOT say "menu likhein". Instead, tell them what's available.

=== HOW TO HANDLE ORDERS ===

If customer says "1 burger chahiye":
-> Add ONLY 1 burger. Nothing else.
-> Confirm: "1 Burger - Rs. 500. Aur kuch chahiye?"

If customer says "2 burger aur 1 fries":
-> Add 2 burgers + 1 fries. Nothing else.

If customer says "pizza bhi":
-> Ask which pizza. Don't add random pizza.

If customer says "nahi, sirf burger tha":
-> Remove everything else, keep only burger.
-> "Maaf kijiye. Sirf 1 burger order kar raha hoon."

=== RESTAURANT INFO ===
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
 * Parse customer message - STRICT parsing
 * ONLY extract items customer EXPLICITLY requested
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
          content: `Customer message parse karein. STRICT RULES:

1. ONLY add items that customer EXPLICITLY requested
2. NEVER invent, guess, or assume items
3. NEVER add items from menu unless customer clearly asked for them
4. Price numbers (Rs. 500) are PRICES, not quantities
5. Default qty = 1 (only if customer clearly wants that item)
6. MAX qty = 5 per item
7. If customer asks "kya available hai" -> action = "chat" (bot will show menu)
8. If customer says "nahi, sirf burger tha" -> action = "correct" (remove other items)
9. If customer says "remove fries" -> action = "remove" 
10. If customer says "quantity 2 kar do" -> action = "update_qty"
11. NEVER add suggested items as orders

Return ONLY JSON:
{
  "action": "chat|add_items|checkout|confirm|cancel|correct|remove|update_qty",
  "items": [{"name": "exact menu item name", "qty": 1}],
  "remove_items": ["item names to remove"],
  "update_qty": {"item_name": "burger", "new_qty": 2},
  "order_type": "delivery|pickup|null",
  "customer_name": "string|null",
  "customer_phone": "string|null", 
  "customer_address": "string|null",
  "wants_to_checkout": false,
  "wants_to_confirm": false,
  "wants_to_cancel": false,
  "reply_hint": "what customer wants"
}

CRITICAL: items array should ONLY contain items customer EXPLICITLY asked for. If customer didn't ask for an item, DO NOT add it.

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
    
    // Match items to actual menu items - STRICT
    if (parsed.items && Array.isArray(parsed.items)) {
      const matchedItems = [];
      for (const item of parsed.items) {
        const menuItem = menuItems.find(m => 
          m.name.toLowerCase() === item.name.toLowerCase() ||
          m.name.toLowerCase().includes(item.name.toLowerCase()) ||
          item.name.toLowerCase().includes(m.name.toLowerCase())
        );
        if (menuItem) {
          // HARD LIMIT: Max 5 per item
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
 * Basic parser - 100% reliable, STRICT
 */
function basicParseMessage(message, menuItems, cart = []) {
  const lower = message.toLowerCase().trim();
  
  const result = {
    action: 'chat', items: [], order_type: null,
    customer_name: null, customer_phone: null, customer_address: null,
    wants_to_checkout: false, wants_to_confirm: false, wants_to_cancel: false,
    remove_items: [], update_qty: null
  };
  
  // Cancel
  if (/^(cancel|cancel karo|nahi chahiye|rok do|order cancel)/.test(lower)) {
    result.action = 'cancel'; result.wants_to_cancel = true;
    return result;
  }
  
  // Confirm
  if (/^(confirm|yes|haan|ok|okay|theek|pakka|kar do|karein|ho jaye|confirm karein)/.test(lower)) {
    result.action = 'confirm'; result.wants_to_confirm = true;
    return result;
  }
  
  // Checkout
  if (/^(done|ho gaya|bas itna|finish|complete|checkout|bas kafi|bas yehi|nahi bas)/.test(lower)) {
    result.action = 'checkout'; result.wants_to_checkout = true;
    return result;
  }
  
  // Correction - "nahi, sirf burger tha"
  if (lower.includes('nahi') && lower.includes('sirf')) {
    result.action = 'correct';
    // Find the item they want to keep
    for (const menuItem of menuItems) {
      if (lower.includes(menuItem.name.toLowerCase())) {
        result.items = [{ item_id: menuItem.id, name: menuItem.name, price: menuItem.price, qty: 1 }];
        break;
      }
    }
    return result;
  }
  
  // Remove item
  if (lower.includes('remove') || lower.includes('hata') || lower.includes('hatao') || lower.includes('nikal')) {
    result.action = 'remove';
    for (const menuItem of menuItems) {
      if (lower.includes(menuItem.name.toLowerCase())) {
        result.remove_items = [menuItem.name];
        break;
      }
    }
    return result;
  }
  
  // Update quantity
  const qtyUpdateMatch = lower.match(/(\d+)\s*kar\s*do/) || lower.match(/quantity\s*(\d+)/);
  if (qtyUpdateMatch) {
    const newQty = Math.min(parseInt(qtyUpdateMatch[1]), 5);
    for (const menuItem of menuItems) {
      if (lower.includes(menuItem.name.toLowerCase())) {
        result.action = 'update_qty';
        result.update_qty = { item_name: menuItem.name, new_qty: newQty };
        break;
      }
    }
    if (result.action === 'update_qty') return result;
  }
  
  // Delivery
  if (lower === '1' || lower === 'delivery' || lower.includes('deliver')) {
    result.order_type = 'delivery'; result.action = 'add_items';
    return result;
  }
  
  // Pickup  
  if (lower === '2' || lower === 'pickup' || lower.includes('pickup') || lower.includes('pick')) {
    result.order_type = 'pickup'; result.action = 'add_items';
    return result;
  }
  
  // Menu questions - natural language
  if (lower.includes('kya kya') || lower.includes('kya available') || lower.includes('kya hai') || 
      lower.includes('menu') || lower.includes('kya chahiye') || lower.includes('options') ||
      lower.includes('kya khilaoge') || lower.includes('kya milega') || lower.includes('list')) {
    result.action = 'chat'; // Bot will show menu in response
    return result;
  }
  
  // Find menu items - ONLY add what customer explicitly asks for
  const orderWords = ['chahiye', 'chahiye ga', 'kar do', 'kardo', 'de do', 'dedo', 'laga do', 
                      'bana do', 'order', 'mujhe', 'merko', 'len', 'khana', 'khila', 'de dena',
                      'chahiye thi', 'lagao', 'do'];
  const isOrdering = orderWords.some(w => lower.includes(w)) || 
                     /\d+\s*x\s/.test(lower) || /\d+\s*(plate|portion|piece)/.test(lower);
  
  if (isOrdering) {
    for (const menuItem of menuItems) {
      const itemName = menuItem.name.toLowerCase();
      if (lower.includes(itemName)) {
        let qty = 1;
        
        // Check for explicit quantity
        const qtyXMatch = message.match(new RegExp(`(\\d+)\\s*x\\s*${itemName}`, 'i'));
        if (qtyXMatch) {
          qty = parseInt(qtyXMatch[1]);
        } else {
          const plateMatch = message.match(/(\d+)\s*(plate|plates|portion|portions|piece|pieces)/i);
          if (plateMatch && lower.includes(itemName)) {
            qty = parseInt(plateMatch[1]);
          } else {
            // Check for number before item name
            const numBefore = message.match(new RegExp(`(\\d+)\\s*${itemName}`, 'i'));
            if (numBefore) qty = parseInt(numBefore[1]);
          }
        }
        
        // HARD LIMIT: Max 5
        if (qty > 5) qty = 5;
        if (qty < 1) qty = 1;
        
        result.action = 'add_items';
        result.items = [{ item_id: menuItem.id, name: menuItem.name, price: menuItem.price, qty }];
        break; // Only first item in basic parser
      }
    }
  }
  
  // Extract phone
  const phoneMatch = message.match(/(?:\+?92|0)(3\d{9})/);
  if (phoneMatch) result.customer_phone = '0' + phoneMatch[1];
  
  return result;
}

/**
 * Fallback response - natural, context-aware
 */
function getFallbackResponse(message, context = {}) {
  const lower = (message || '').toLowerCase().trim();
  const cart = context.cart || [];
  const isOpen = context.isOpen !== false;
  const restaurant = context.restaurant || {};
  const menuItems = context.menuItems || [];
  
  if (!lower) {
    return `Bataiye, kya help karoon? 😊`;
  }
  
  // Greetings
  if (/^(salam|assalam|assalamualaikum|salaam|hi+|hello+|hey+|yo|aoa|hola|adab)/.test(lower)) {
    const greetings = [
      `Walaikum salam! 🌟\n\n${restaurant.name || 'Restaurant'} mein khush aamdeed! 😊\n\nKya order karna chahenge?`,
      `Assalam o Alaikum! 🌟\n\nAap ka swagat hai! Bataiye kya khilaoon? 😊`
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  
  // Natural menu questions
  if (lower.includes('kya kya') || lower.includes('kya available') || lower.includes('kya hai') || 
      lower.includes('menu') || lower.includes('kya khilaoge') || lower.includes('kya milega') ||
      lower.includes('options') || lower.includes('kya chahiye') || lower.includes('list')) {
    if (!isOpen) return `Maaf kijiye, restaurant abhi band hai. 😔`;
    if (menuItems.length === 0) return 'Menu abhi update nahi hua. 😅';
    
    let msg = `Hamare paas yeh available hai:\n\n`;
    const categories = {};
    menuItems.forEach(item => {
      const cat = item.category_name || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(`• ${item.name} - Rs. ${item.price}`);
    });
    Object.entries(categories).forEach(([cat, items]) => {
      msg += `*${cat}*\n${items.join('\n')}\n\n`;
    });
    msg += `Kya order karna chahenge? 😊`;
    return msg;
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
  
  // Order
  if (lower.includes('order') || lower.includes('bhook') || lower.includes('khana')) {
    if (!isOpen) return `Maaf kijiye, restaurant abhi band hai. 😔`;
    return `Bilkul! 🛒 Bataiye kya order karna hai? 😊`;
  }
  
  // Checkout
  if (/^(done|ho gaya|bas itna|finish)/.test(lower)) {
    if (cart.length === 0) return 'Aap ka cart khaali hai! Pehle kuch add karein. 😊';
    let msg = `Aap ka Order:\n\n`;
    let subtotal = 0;
    cart.forEach((item, i) => {
      msg += `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n`;
      subtotal += item.qty * item.price;
    });
    msg += `\n*Total: Rs. ${subtotal}*\n\nConfirm karein? (Haan/Nahi)`;
    return msg;
  }
  
  // Correction
  if (lower.includes('nahi') && lower.includes('sirf')) {
    return `Maaf kijiye! Order correct kar raha hoon. 😊`;
  }
  
  // Remove
  if (lower.includes('remove') || lower.includes('hata') || lower.includes('hatao')) {
    return `Theek hai, remove kar diya. 😊 Aur kuch?`;
  }
  
  // Confirm
  if (/^(confirm|yes|haan|ok)/.test(lower)) {
    return 'Order confirm ho gaya! 🎉 Shukriya! 😊';
  }
  
  // Hours
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
    return `${matchedItem.name} - Rs. ${matchedItem.price} ✅\n\nKitne chahiye? 😊`;
  }
  
  // Default - natural
  const defaults = [
    `Bataiye, kya help karoon? 😊`,
    `Samajh gaya! 😊 Kya order karna chahenge?`,
    `Ji bataiye! 😊`,
    `Kya chahiye? 😊`
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

module.exports = {
  generateResponse, getFallbackResponse, parseCustomerMessage,
  basicParseMessage, buildSystemPrompt, isAIAvailable, getZAI
};
