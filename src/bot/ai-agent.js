/**
 * AI-Powered Restaurant Agent - Natural & Reliable
 * 
 * Features:
 * - Only adds items customer EXPLICITLY orders (no random quantities)
 * - Natural conversation like a real human
 * - 100% fallback when AI unavailable
 * - Quantity only when explicitly stated (2x, 2 plates, etc)
 */

let zaiInstance = null;
let aiAvailable = false;

async function getZAI() {
  if (zaiInstance) return zaiInstance;
  
  try {
    const ZAI = require('z-ai-web-dev-sdk').default;
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
 * Generate natural AI response
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
      max_tokens: 150
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
 * Build system prompt - ChatGPT style unlimited conversation
 */
function buildSystemPrompt(restaurant, customer, context) {
  const {
    menuItems = [],
    deals = [],
    operatingHours = [],
    deliveryAreas = [],
    isOpen = true,
    closingTime = null,
    recentOrders = [],
    isVIP = false,
    isReturning = false,
    cart = []
  } = context;

  let menuSummary = 'Menu khaali hai';
  if (menuItems.length > 0) {
    const categories = {};
    menuItems.forEach(item => {
      const cat = item.category_name || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(`${item.name} (Rs. ${item.price})`);
    });
    menuSummary = Object.entries(categories)
      .map(([cat, items]) => `${cat}: ${items.join(', ')}`)
      .join('\n');
  }

  let dealsSummary = 'No active deals';
  if (deals.length > 0) {
    dealsSummary = deals.map(d => `${d.name} - Rs. ${d.deal_price}${d.original_price ? ` (was Rs. ${d.original_price})` : ''}`).join(', ');
  }

  let cartSummary = '';
  if (cart.length > 0) {
    const subtotal = cart.reduce((s, i) => s + (i.qty * i.price), 0);
    cartSummary = `\n\nCURRENT CART: ${cart.map(i => `${i.qty}x ${i.name} (Rs. ${i.qty * i.price})`).join(', ')} = Rs. ${subtotal}`;
  }

  return `Aap ${restaurant.name} k yahan ek dostana agent ho. ChatGPT ki tarah natural aur intelligent conversation karein - unlimited topics, lekin restaurant k context mein.

Aap ki personality:
- Friendly, warm, helpful - jaise ek dost baat kar raha ho
- Roman Urdu/English mix (Pakistani WhatsApp style)
- Short replies (1-2 lines, max 3) - real WhatsApp texting style
- Use 1-2 emojis naturally (not excessive)
- NEVER say "main ek AI hoon" ya "bot" - aap ek real insaan ho
- Natural curiosity - customer se puch lein kya chahte hain

Aap kya kar sakte hain:
- Restaurant k baare mein HAR tarah ki baat karein (food, service, hours, etc)
- Orders lein, menu suggest karein
- General chat - weather, greetings, small talk
- Customer k sawalon ka natural jawab dein
- Cart manage karein, items add/remove karein
- Checkout flow handle karein

CRITICAL RULES:
- Quantity sirf tabhi badhao jab customer EXPLICITLY bole (2x, 2 plates, do, etc)
- Prices ko quantity mat samajho!
- 1 message mein 1 item add karo (natural flow)
- Agar customer kuch order kare to confirm karo
- Restaurant band ho to batao
- Natural conversation jaise ChatGPT karta hai - har sawal ka jawab do

Restaurant: ${restaurant.name}
Phone: ${restaurant.phone}
Address: ${restaurant.address || 'N/A'}
Status: ${isOpen ? 'OPEN' : 'CLOSED'}${closingTime ? ` (closes ${closingTime})` : ''}
Delivery Fee: Rs. ${restaurant.delivery_fee_default || 100}

MENU:
${menuSummary}

ACTIVE DEALS:
${dealsSummary}
${cartSummary}

Customer: ${customer?.name || 'Naya customer'}${isVIP ? ' (VIP!)' : ''}${isReturning ? ' (Returning)' : ''}`;
}

/**
 * Parse customer message - ONLY extract what's clearly stated
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
          content: `Customer message parse karein. Sirf wahi items add karein jo customer EXPLICITLY order kare.

Return ONLY JSON:
{
  "action": "chat|add_items|checkout|confirm|cancel",
  "items": [{"name": "exact menu item name", "qty": 1}],
  "order_type": "delivery|pickup|null",
  "customer_name": "string|null",
  "customer_phone": "string|null",
  "customer_address": "string|null",
  "wants_to_checkout": false,
  "wants_to_confirm": false,
  "wants_to_cancel": false
}

CRITICAL RULES:
- qty sirf tabhi 1 se zyada karein jab customer CLEARLY likhe (jaise "2x biryani", "2 plates", "do biryani")
- Agar customer sirf item naam likhe (jaise "biryani chahiye") to qty = 1
- Prices ko quantity mat samajhein!
- Agar customer menu poochhe to action = "chat" (menu show hoga)
- Agar customer sirf baat kar raha hai to action = "chat"
- Customer ne "done", "bas", "ho gaya" kaha to action = "checkout"
- Customer ne "cancel" kaha to action = "cancel"

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
    
    // Match items to actual menu items
    if (parsed.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
      const matchedItems = [];
      for (const item of parsed.items) {
        const menuItem = menuItems.find(m => 
          m.name.toLowerCase() === item.name.toLowerCase() ||
          m.name.toLowerCase().includes(item.name.toLowerCase()) ||
          item.name.toLowerCase().includes(m.name.toLowerCase())
        );
        if (menuItem) {
          // ONLY use quantity if explicitly stated (2 or more)
          let qty = 1;
          if (item.qty && item.qty > 1) {
            // Verify the quantity is mentioned in the message
            const numPattern = new RegExp(`(\\d+)\\s*x\\s*${menuItem.name}`, 'i');
            const numMatch = message.match(numPattern);
            if (numMatch) {
              qty = Math.min(parseInt(numMatch[1]), 20);
            } else {
              // Check if "2 plates", "2 portion" etc
              const platePattern = new RegExp(`(\\d+)\\s*(plate|portion|piece|burger|pizza)`, 'i');
              const plateMatch = message.match(platePattern);
              if (plateMatch) {
                qty = Math.min(parseInt(plateMatch[1]), 20);
              }
            }
          }
          matchedItems.push({
            item_id: menuItem.id,
            name: menuItem.name,
            price: menuItem.price,
            qty: qty
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
 * Basic parser - 100% reliable, no random quantities
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
  if (/^(cancel|cancel karo|nahi chahiye|rok do|bas cancel)/.test(lower)) {
    result.action = 'cancel';
    result.wants_to_cancel = true;
    return result;
  }
  
  // Confirm
  if (/^(confirm|yes|haan|ok|okay|theek|pakka|kar do|karein|ho jaye|confirm karein)/.test(lower)) {
    result.action = 'confirm';
    result.wants_to_confirm = true;
    return result;
  }
  
  // Done/checkout
  if (/^(done|ho gaya|bas itna|finish|complete|checkout|bas kafi|bas yehi|nahi bas)/.test(lower)) {
    result.action = 'checkout';
    result.wants_to_checkout = true;
    return result;
  }
  
  // Delivery
  if (lower === '1' || lower === 'delivery' || lower.includes('deliver')) {
    result.order_type = 'delivery';
    result.action = 'add_items';
    return result;
  }
  
  // Pickup
  if (lower === '2' || lower === 'pickup' || lower.includes('pickup') || lower.includes('pick')) {
    result.order_type = 'pickup';
    result.action = 'add_items';
    return result;
  }
  
  // Menu request
  if (/^(menu|cart dekho|kya kya hai|kya mojood|items|list|kya hai)/.test(lower)) {
    result.action = 'chat'; // Will trigger menu display
    return result;
  }
  
  // Try to find menu items - ONLY if customer is clearly ordering
  const orderWords = ['chahiye', 'chahiye ga', 'kar do', 'kardo', 'de do', 'dedo', 'laga do', 'bana do', 'order', 'mujhe', 'merko'];
  const isOrdering = orderWords.some(w => lower.includes(w));
  
  for (const menuItem of menuItems) {
    const itemName = menuItem.name.toLowerCase();
    if (lower.includes(itemName)) {
      // ONLY extract quantity if explicitly stated
      let qty = 1;
      
      // Check for explicit quantity patterns
      // "2x biryani" or "2 x biryani"
      const qtyXMatch = message.match(new RegExp(`(\\d+)\\s*x\\s*${itemName}`, 'i'));
      if (qtyXMatch) {
        qty = Math.min(parseInt(qtyXMatch[1]), 20);
      } else {
        // "biryani 2x" or "biryani x2"
        const qtyXMatch2 = message.match(new RegExp(`${itemName}\\s*(\\d+)\\s*x`, 'i'));
        if (qtyXMatch2) {
          qty = Math.min(parseInt(qtyXMatch2[1]), 20);
        } else {
          // "2 plate biryani" or "2 plates"
          const plateMatch = message.match(/(\d+)\s*(plate|plates|portion|portions|piece|pieces)/i);
          if (plateMatch && lower.includes(itemName)) {
            qty = Math.min(parseInt(plateMatch[1]), 20);
          } else {
            // "do biryani" (urdu number)
            const urduNums = { 'do': 2, 'char': 4, 'chhe': 6, 'aat': 8, 'das': 10 };
            for (const [word, num] of Object.entries(urduNums)) {
              if (lower.includes(`${word} ${itemName}`)) {
                qty = num;
                break;
              }
            }
          }
        }
      }
      
      result.action = 'add_items';
      result.items = [{
        item_id: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        qty: qty
      }];
      break; // Only add ONE item per message (more natural)
    }
  }
  
  // Extract phone number (10+ digits, but not prices)
  const phoneMatch = message.match(/(?:\+?92|0)(3\d{9})/);
  if (phoneMatch) {
    result.customer_phone = '0' + phoneMatch[1];
  }
  
  return result;
}

/**
 * 100% Fallback - always responds naturally
 */
function getFallbackResponse(message, context = {}) {
  const lower = (message || '').toLowerCase().trim();
  const cart = context.cart || [];
  const isOpen = context.isOpen !== false;
  const restaurant = context.restaurant || {};
  const menuItems = context.menuItems || [];
  
  // Empty
  if (!lower) {
    return `Bataiye, kya help karoon? 😊\n\n*menu* - dekhein kya kya hai\n*order* - naya order karein`;
  }
  
  // Greetings - natural welcome
  if (/^(salam|assalam|assalamualaikum|assalam o alaikum|salaam|hi+|hello+|hey+|yo|aoa|hola|adab)/.test(lower)) {
    const greetings = [
      `Walaikum salam! 🌟\n\n${restaurant.name || 'Restaurant'} mein aap ka khush aamdeed! 😊\n\nKya order karna chahenge? "menu" likh kar menu dekh sakte hain!`,
      `Assalam o Alaikum! 🌟\n\nKhush aamdeed! Kya khilaoon aap ko? "menu" likhein! 😊`,
      `Adab! 🌟\n\nAap ka swagat hai! Bataiye kya chahiye? 😊`
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  
  // How are you
  if (/(kaise? ho|kya haal|how are you|kaisa hai)/.test(lower)) {
    return 'Alhamdulillah, theek hoon! 😊 Aap sunayein? Kya order karna hai?';
  }
  
  // Thanks
  if (/(shukriya|shukar|thank|thanks|thx)/.test(lower)) {
    return 'Aray nahi, thank you toh aap ka! 😊 Aur kuch?';
  }
  
  // Goodbye
  if (/(allah hafiz|khuda hafiz|bye|goodbye|take care)/.test(lower)) {
    return 'Allah hafiz! 🌙 Phir milte hain! 😊';
  }
  
  // Menu
  if (/^(menu|cart dekho|kya kya hai|kya mojood|items|list|kya hai)/.test(lower) || lower === 'menu') {
    if (!isOpen) return `Maaf kijiye, restaurant abhi band hai. 😔\n\nKhulne ka waqt check karein!`;
    
    if (menuItems.length === 0) {
      return 'Menu abhi update nahi hua. 😅 Thodi der baad try karein!';
    }
    
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
    
    msg += `Order k liye item ka naam likhein!\nExample: "Chicken Biryani" ya "2x Burger" 😊`;
    return msg;
  }
  
  // Order
  if (/^(order|new order|place order|kar do order|khana order)/.test(lower)) {
    if (!isOpen) return `Maaf kijiye, restaurant abhi band hai. 😔`;
    return `Bilkul! 🛒 Bataiye kya order karna hai?\n\nItem ka naam likhein jaise:\n"Chicken Biryani"\n"2x Zinger Burger"\n\nJab ho jaye toh "done" likhein! 😊`;
  }
  
  // Status
  if (/^(status|order kya hua|kahan hai|track)/.test(lower)) {
    return 'Aap ka last order check karne k liye restaurant se rabta karein, ya naya order karein! 😊';
  }
  
  // Cancel
  if (/^(cancel|cancel karo|nahi chahiye)/.test(lower)) {
    return 'Theek hai, cancel kar diya. 🙏 Kuch aur chahiye toh bataiye!';
  }
  
  // Done/checkout
  if (/^(done|ho gaya|bas itna|finish|checkout)/.test(lower)) {
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
  
  // Confirm
  if (/^(confirm|yes|haan|ok|okay|theek|pakka)/.test(lower)) {
    return 'Order confirm ho gaya! 🎉 Restaurant ko bhej diya. Shukriya! 😊';
  }
  
  // Hours
  if (/(hours|timing|khulta|band|kya waqt|open|close|kab khulta)/.test(lower)) {
    return 'Hum subah 11 baje se raat 11 baje tak khule hain. ⏰ Har roz!';
  }
  
  // Address
  if (/(address|location|kahan|where)/.test(lower)) {
    return `Humara address: ${restaurant.address || 'Address available nahi'} 📍`;
  }
  
  // Payment
  if (/(payment|cash|card|easypaisa|jazzcash|pay)/.test(lower)) {
    return 'Payment k liye:\n💵 Cash on Delivery\n📱 EasyPaisa/JazzCash\n\nOrder k time bata dijiye! 😊';
  }
  
  // Try to match menu item
  const matchedItem = menuItems.find(m => 
    lower.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(lower)
  );
  
  if (matchedItem) {
    return `${matchedItem.name} cart mein add ho gaya! ✅ (Rs. ${matchedItem.price})\n\nAur kuch chahiye? Ya "done" likhein! 😊`;
  }
  
  // Default - always respond
  const defaults = [
    `Bataiye, kya help karoon? 😊\n\n*menu* - menu dekhein\n*order* - order karein`,
    `Samajh gaya! 😊 Kya order karna chahenge? "menu" likhein!`,
    `Ji bataiye! 😊 Menu dekhne k liye "menu" likhein!`,
    `Kya chahiye? 😊 "menu" likh kar menu dekhein, ya item ka naam likhein!`
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
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
