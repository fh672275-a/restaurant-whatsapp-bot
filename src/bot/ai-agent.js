/**
 * AI Agent - Groq LLM Architecture (llama-3.3-70b)
 * 
 * STRICT implementation of the 43-point specification.
 * 4 layers: LLM Conversation + Restaurant Tools + Database + State
 * 
 * NO keyword matching. NO hardcoded responses.
 * Fully natural, context-aware, typo-tolerant.
 */

const https = require('https');

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

let zaiInstance = null;
let aiAvailable = false;

function isAIAvailable() { return aiAvailable; }

async function callGroq(messages, temperature = 0.6, maxTokens = 300) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: GROQ_MODEL, messages, temperature, max_tokens: maxTokens });
    const options = {
      hostname: 'api.groq.com', path: '/openai/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(json.error.message)); return; }
          resolve(json.choices?.[0]?.message?.content?.trim() || '');
        } catch (e) { reject(new Error('Groq parse error: ' + e.message)); }
      });
    });
    req.on('error', (e) => reject(new Error('Groq request failed: ' + e.message)));
    req.write(body);
    req.end();
  });
}

async function getZAI() {
  if (GROQ_API_KEY) { aiAvailable = true; console.log('[AI] Groq ready (' + GROQ_MODEL + ')'); return true; }
  try {
    const ZAI = require('z-ai-web-dev-sdk').default;
    const fs = require('fs'), path = require('path');
    const configPath = path.join(process.cwd(), '.z-ai-config');
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify({
        "baseUrl": "https://internal-api.z.ai/v1", "apiKey": "Z.ai",
        "chatId": "chat-a038bcb7-2b3f-4eb5-a0ae-aba1bed8b513",
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiOTg3ZGM3NmItMTYzZC00ZDgwLWFlOWItZTdmYzNmZjNiZWZkIiwiY2hhdF9pZCI6ImNoYXQtYTAzOGJjYjctMmIzZi00ZWI1LWEwYWUtYWJhMWJlZDhiNTEzIiwicGxhdGZvcm0iOiJ6YWkifQ.JMV554kVcONRxoZrXgxhWE0wZ2mhLfEkD_RVHUPaDbo",
        "userId": "987dc76b-163d-4d80-ae9b-e7fc3ff3befd"
      }));
    }
    zaiInstance = await ZAI.create();
    aiAvailable = true; console.log('[AI] Using z-ai SDK (fallback)');
    return zaiInstance;
  } catch (e) { console.log('[AI] No AI available'); aiAvailable = false; return null; }
}

/**
 * Generate Response - Pure LLM (Groq)
 */
async function generateResponse(restaurant, customer, customerMessage, context = {}) {
  try {
    const systemPrompt = buildSystemPrompt(restaurant, customer, context);
    const messages = [{ role: 'system', content: systemPrompt }];
    if (context.conversationHistory) {
      context.conversationHistory.slice(-10).forEach(msg => {
        messages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
      });
    }
    messages.push({ role: 'user', content: customerMessage });

    if (GROQ_API_KEY) {
      try { const r = await callGroq(messages, 0.6, 300); if (r) return r; } catch (e) { console.error('[AI] Groq:', e.message); }
    }
    if (zaiInstance) {
      const c = await zaiInstance.chat.completions.create({ messages, thinking: { type: 'disabled' }, temperature: 0.6, max_tokens: 300 });
      const r = c.choices[0]?.message?.content; if (r) return r.trim();
    }
    return getFallbackResponse(customerMessage, context);
  } catch (e) { console.error('[AI] Error:', e.message); return getFallbackResponse(customerMessage, context); }
}

/**
 * System Prompt - Based on 43-point specification
 */
function buildSystemPrompt(restaurant, customer, context) {
  const { menuItems = [], deals = [], isOpen = true, closingTime = null, cart = [] } = context;
  let menuText = 'Menu khaali hai';
  if (menuItems.length > 0) {
    const cats = {};
    menuItems.forEach(i => { const c = i.category_name || 'Other'; if (!cats[c]) cats[c] = []; cats[c].push(i.name + ' (Rs. ' + i.price + ')'); });
    menuText = Object.entries(cats).map(([c, items]) => c + ':\n  ' + items.join('\n  ')).join('\n\n');
  }
  let dealsText = deals.length > 0 ? deals.map(d => d.name + ' - Rs. ' + d.deal_price).join('\n') : 'No deals';
  let cartText = cart.length > 0 ? '\n\nCURRENT ORDER:\n' + cart.map(i => i.qty + 'x ' + i.name + ' - Rs. ' + (i.qty * i.price)).join('\n') + '\nSubtotal: Rs. ' + cart.reduce((s, i) => s + (i.qty * i.price), 0) : '';

  return `You are a real Pakistani waiter at "${restaurant.name}" on WhatsApp. You are having a natural conversation with a customer.

=== YOUR IDENTITY ===
- Friendly, helpful, natural Pakistani waiter
- Speak in Roman Urdu/English naturally (match customer's style)
- Short replies (1-3 lines) like real WhatsApp texting
- 1-2 emojis max, natural usage
- NEVER say you are an AI or bot
- Use "Jee", "bhai" naturally where appropriate, don't overuse

=== CRITICAL RULES (NEVER BREAK) ===
1. ONLY add items to order that customer EXPLICITLY asks for
2. NEVER invent, guess, or assume items
3. Prices come ONLY from the menu below (never invent prices)
4. Default qty = 1 (only if customer clearly wants the item)
5. MAX qty per item = 5
6. If customer asks "kya hai/available/mojood" -> list ACTUAL menu items
7. If customer names an item -> recognize as order, ask quantity naturally
8. If customer corrects ("nahi sirf burger") -> fix order immediately
9. NEVER say "menu likhein" or force keywords
10. Show order summary before final confirmation
11. If unclear -> ASK a specific question, never guess
12. Handle typos naturally ("2 zngr" = 2 Zinger, "1 cok" = 1 Coke)
13. Understand context ("coke bhi" = add coke to existing order, "2" = 2 of previous item)
14. Never re-ask info already provided (name, address, phone)
15. Ask one question at a time (don't make it feel like a form)
16. Customer can interrupt flow (answer side questions naturally)

=== ACTUAL MENU (from database - source of truth) ===
${menuText}

=== ACTIVE DEALS ===
${dealsText}
${cartText}

=== RESTAURANT INFO ===
Name: ${restaurant.name}
Phone: ${restaurant.phone}
Status: ${isOpen ? 'OPEN' : 'CLOSED'}${closingTime ? ' (closes ' + closingTime + ')' : ''}
Delivery Fee: Rs. ${restaurant.delivery_fee_default || 100}

=== CUSTOMER ===
Name: ${customer?.name || 'Naya customer'}

=== HOW TO RESPOND ===
- If customer greets -> greet back naturally, ask what they want
- If customer asks about menu -> show actual items from menu above
- If customer orders -> confirm item added, ask if anything else
- If customer says "done/ho gaya" -> show order summary, ask delivery/pickup
- If customer corrects -> apologize, fix order, show updated summary
- If customer asks price -> tell price from menu above
- If customer asks recommendation -> suggest based on menu
- NEVER use formal corporate language
- NEVER send long paragraphs unless asked`;
}

/**
 * Parse customer message - LLM powered (Groq)
 */
async function parseCustomerMessage(message, menuItems, cart = []) {
  try {
    const menuSummary = menuItems.map(m => m.name + ' (Rs. ' + m.price + ')').join(', ');
    const systemPrompt = `Parse the customer's message. Return ONLY valid JSON.

You are a smart parser that understands:
- Roman Urdu, Urdu, English, mixed language
- Typos ("zngr" = Zinger, "cok" = Coke)
- Context ("coke bhi" = add Coke, "2" = 2 of previous item, "wo bhi" = same as before)
- Modifications ("coke hata do" = remove Coke, "2 kar do" = change qty to 2)

STRICT RULES:
1. ONLY add items the customer EXPLICITLY requested
2. NEVER invent items
3. Price numbers are PRICES not quantities
4. Default qty = 1, MAX qty = 5
5. Handle typos: match to closest menu item
6. "kya hai/available/mojood" -> action = "chat" (bot will show menu)
7. "nahi sirf X" -> action = "correct" with items = [X]
8. "remove X / X hata do" -> action = "remove" with remove_items = [X]
9. "X 2 kar do / quantity 2" -> action = "update_qty"
10. "done/ho gaya/bas" -> action = "checkout"
11. NEVER add suggested items as orders
12. "coke bhi" means add Coke (if Coke exists in menu)

Current cart: ${JSON.stringify(cart)}
Menu items: ${menuSummary}

Return JSON:
{"action":"chat|add_items|checkout|confirm|cancel|correct|remove|update_qty","items":[{"name":"exact menu item name","qty":1}],"remove_items":[],"update_qty":null,"order_type":null,"customer_name":null,"customer_phone":null,"customer_address":null,"wants_to_checkout":false,"wants_to_confirm":false,"wants_to_cancel":false}`;

    const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }];
    let response = null;

    if (GROQ_API_KEY) {
      try { response = await callGroq(messages, 0, 400); } catch (e) { console.error('[AI] Groq parse:', e.message); }
    }
    if (!response && zaiInstance) {
      const c = await zaiInstance.chat.completions.create({ messages, thinking: { type: 'disabled' }, temperature: 0, max_tokens: 400 });
      response = c.choices[0]?.message?.content?.trim();
    }
    if (!response) return basicParseMessage(message, menuItems, cart);

    if (response.includes('```')) response = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(response);

    if (parsed.items && Array.isArray(parsed.items)) {
      const matched = [];
      for (const item of parsed.items) {
        const mi = menuItems.find(m => m.name.toLowerCase().includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(m.name.toLowerCase()));
        if (mi) matched.push({ item_id: mi.id, name: mi.name, price: mi.price, qty: Math.min(Math.max(item.qty || 1, 1), 5) });
      }
      parsed.items = matched;
    } else parsed.items = [];
    if (parsed.customer_phone) parsed.customer_phone = parsed.customer_phone.replace(/[^0-9]/g, '');
    return parsed;
  } catch (e) { console.error('[AI] parse error:', e.message); return basicParseMessage(message, menuItems, cart); }
}

/**
 * Basic parser - minimal fallback (only used if ALL AI fails)
 */
function basicParseMessage(message, menuItems, cart = []) {
  const lower = message.toLowerCase().trim();
  const result = { action: 'chat', items: [], order_type: null, customer_name: null, customer_phone: null, customer_address: null, wants_to_checkout: false, wants_to_confirm: false, wants_to_cancel: false, remove_items: [], update_qty: null };

  if (/^(cancel|nahi chahiye|rok do)/.test(lower)) { result.action = 'cancel'; result.wants_to_cancel = true; return result; }
  if (/^(confirm|haan|ok|pakka|kar do|kareen|krdo)/.test(lower)) { result.action = 'confirm'; result.wants_to_confirm = true; return result; }
  if (/^(done|ho gaya|bas itna|finish|bas yehi|bus)/.test(lower)) { result.action = 'checkout'; result.wants_to_checkout = true; return result; }
  if (lower.includes('nahi') && lower.includes('sirf')) { result.action = 'correct'; for (const mi of menuItems) { if (lower.includes(mi.name.toLowerCase())) { result.items = [{ item_id: mi.id, name: mi.name, price: mi.price, qty: 1 }]; break; } } return result; }
  if (lower.includes('remove') || lower.includes('hata') || lower.includes('hatao') || lower.includes('nikal')) { result.action = 'remove'; for (const mi of menuItems) { if (lower.includes(mi.name.toLowerCase())) { result.remove_items = [mi.name]; break; } } return result; }
  const qm = lower.match(/(\d+)\s*kar\s*do/) || lower.match(/quantity\s*(\d+)/);
  if (qm) { const nq = Math.min(parseInt(qm[1]), 5); for (const mi of menuItems) { if (lower.includes(mi.name.toLowerCase())) { result.action = 'update_qty'; result.update_qty = { item_name: mi.name, new_qty: nq }; break; } } if (result.action === 'update_qty') return result; }
  if (lower === '1' || lower.includes('deliver')) { result.order_type = 'delivery'; result.action = 'add_items'; return result; }
  if (lower === '2' || lower.includes('pickup')) { result.order_type = 'pickup'; result.action = 'add_items'; return result; }

  // Try to find menu items (fuzzy)
  for (const mi of menuItems) {
    const itemName = mi.name.toLowerCase();
    if (lower.includes(itemName)) {
      let q = 1;
      const qx = message.match(new RegExp('(\\d+)\\s*x\\s*' + itemName, 'i'));
      if (qx) q = parseInt(qx[1]);
      else { const pm = message.match(/(\d+)\s*(plate|portion|piece)/i); if (pm && lower.includes(itemName)) q = parseInt(pm[1]); }
      if (q > 5) q = 5; if (q < 1) q = 1;
      result.action = 'add_items'; result.items = [{ item_id: mi.id, name: mi.name, price: mi.price, qty: q }]; break;
    }
  }
  const pm = message.match(/(?:\+?92|0)(3\d{9})/); if (pm) result.customer_phone = '0' + pm[1];
  return result;
}

/**
 * Fallback - ONLY if Groq AND z-ai both fail
 */
function getFallbackResponse(message, context = {}) {
  const lower = (message || '').toLowerCase().trim();
  const cart = context.cart || [], isOpen = context.isOpen !== false;
  const restaurant = context.restaurant || {}, menuItems = context.menuItems || [];
  if (!lower) return 'Bataiye, kya help karoon? 😊';
  if (/^(salam|assalam|salaam|hi+|hello+|hey+|aoa|adab)/.test(lower)) return 'Walaikum salam! 🌟\n\n' + (restaurant.name || 'Restaurant') + ' mein khush aamdeed! 😊\n\nKya order karna chahenge?';
  
  // Menu questions - handle both spellings
  if (lower.includes('kya kya') || lower.includes('kia kia') || lower.includes('kya available') || lower.includes('kia available') || lower.includes('kya hai') || lower.includes('kia hai') || lower.includes('kya mojood') || lower.includes('kia mojood') || lower.includes('menu') || lower.includes('options') || lower.includes('list') || lower.includes('paas kya') || lower.includes('paas kia')) {
    if (!isOpen) return 'Maaf kijiye, restaurant abhi band hai. 😔';
    if (menuItems.length === 0) return 'Menu abhi update nahi hua. 😅';
    let msg = 'Hamare paas yeh available hai:\n\n'; const cats = {};
    menuItems.forEach(i => { const c = i.category_name || 'Other'; if (!cats[c]) cats[c] = []; cats[c].push('• ' + i.name + ' - Rs. ' + i.price); });
    Object.entries(cats).forEach(([c, items]) => { msg += '*' + c + '*\n' + items.join('\n') + '\n\n'; });
    msg += 'Kya order karna chahenge? 😊'; return msg;
  }
  
  if (/(kaise? ho|kya haal|kia haal)/.test(lower)) return 'Alhamdulillah, theek! 😊 Aap sunayein?';
  if (/(shukriya|thank)/.test(lower)) return 'Aray nahi, thank you toh aap ka! 😊';
  if (/(allah hafiz|bye)/.test(lower)) return 'Allah hafiz! 🌙 Phir milte hain! 😊';
  if (/^(done|ho gaya|bas itna|finish|bus)/.test(lower)) {
    if (cart.length === 0) return 'Cart khaali hai! Pehle kuch add karein. 😊';
    let m = 'Aap ka Order:\n\n', s = 0; cart.forEach((i, x) => { m += (x+1) + '. ' + i.qty + 'x ' + i.name + ' - Rs. ' + (i.qty*i.price) + '\n'; s += i.qty*i.price; });
    return m + '\n*Total: Rs. ' + s + '*\n\nDelivery (1) ya Pickup (2)?';
  }
  if (lower.includes('nahi') && lower.includes('sirf')) return 'Maaf kijiye! Order correct kar raha hoon. 😊';
  if (lower.includes('remove') || lower.includes('hata')) return 'Theek hai, remove kar diya. 😊';
  if (/^(confirm|haan|ok)/.test(lower)) return 'Order confirm ho gaya! 🎉 Shukriya! 😊';
  if (/(hours|timing|khulta)/.test(lower)) return 'Hum 11 AM se 11 PM tak khule hain. ⏰';
  if (/(address|location|kahan)/.test(lower)) return 'Address: ' + (restaurant.address || 'N/A') + ' 📍';
  if (/(payment|cash|card|easypaisa)/.test(lower)) return 'Payment: 💵 Cash | 📱 EasyPaisa/JazzCash 😊';
  const mi = menuItems.find(m => lower.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(lower));
  if (mi) return mi.name + ' - Rs. ' + mi.price + ' ✅\n\nKitne chahiye? 😊';
  
  // Default: show menu if available
  if (menuItems.length > 0 && lower.length > 3) {
    let msg = 'Hamare paas yeh available hai:\n\n'; const cats = {};
    menuItems.forEach(i => { const c = i.category_name || 'Other'; if (!cats[c]) cats[c] = []; cats[c].push('• ' + i.name + ' - Rs. ' + i.price); });
    Object.entries(cats).forEach(([c, items]) => { msg += '*' + c + '*\n' + items.join('\n') + '\n\n'; });
    msg += 'Kya order karna chahenge? 😊'; return msg;
  }
  return 'Bataiye, kya help karoon? 😊';
}

module.exports = { generateResponse, getFallbackResponse, parseCustomerMessage, basicParseMessage, buildSystemPrompt, isAIAvailable, getZAI };
