/**
 * AI Agent - Groq LLM (llama-3.3-70b) + z-ai fallback
 * 
 * Uses Groq API (OpenAI-compatible) for fast, natural LLM responses.
 * - Understands ANY message naturally
 * - Checks actual restaurant menu from DB
 * - NEVER invents items customer didn't order
 * - Quantity max 5, price never used as qty
 */

const https = require('https');

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

let aiAvailable = false;
let zaiInstance = null;

function isAIAvailable() {
  return aiAvailable;
}

async function callGroq(messages, temperature = 0.7, maxTokens = 250) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: GROQ_MODEL,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
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
    const fs = require('fs');
    const path = require('path');
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
    aiAvailable = true;
    console.log('[AI] Using z-ai SDK (fallback)');
    return zaiInstance;
  } catch (e) { console.log('[AI] No AI available'); aiAvailable = false; return null; }
}

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
      try { const r = await callGroq(messages, 0.7, 250); if (r) return r; } catch (e) { console.error('[AI] Groq:', e.message); }
    }
    if (zaiInstance) {
      const c = await zaiInstance.chat.completions.create({ messages, thinking: { type: 'disabled' }, temperature: 0.7, max_tokens: 250 });
      const r = c.choices[0]?.message?.content; if (r) return r.trim();
    }
    return getFallbackResponse(customerMessage, context);
  } catch (e) { console.error('[AI] Error:', e.message); return getFallbackResponse(customerMessage, context); }
}

function buildSystemPrompt(restaurant, customer, context) {
  const { menuItems = [], deals = [], isOpen = true, closingTime = null, cart = [] } = context;
  let menuText = 'Menu khaali hai';
  if (menuItems.length > 0) {
    const cats = {};
    menuItems.forEach(i => { const c = i.category_name || 'Other'; if (!cats[c]) cats[c] = []; cats[c].push(i.name + ' - Rs. ' + i.price); });
    menuText = Object.entries(cats).map(([c, items]) => c + ':\n  ' + items.join('\n  ')).join('\n\n');
  }
  let dealsText = deals.length > 0 ? deals.map(d => d.name + ' - Rs. ' + d.deal_price).join('\n') : 'No deals';
  let cartText = cart.length > 0 ? '\n\nCURRENT ORDER:\n' + cart.map(i => i.qty + 'x ' + i.name + ' - Rs. ' + (i.qty * i.price)).join('\n') + '\nSubtotal: Rs. ' + cart.reduce((s, i) => s + (i.qty * i.price), 0) : '';

  return 'You are a real waiter at "' + restaurant.name + '" restaurant on WhatsApp.\n\nPERSONALITY:\n- Friendly, warm, helpful Pakistani waiter\n- Roman Urdu/English (Pakistani WhatsApp style)\n- Short replies (1-3 lines)\n- 1-2 emojis\n- NEVER say you are AI/bot\n\nCRITICAL RULES (NEVER BREAK):\n1. ONLY add items customer EXPLICITLY requests\n2. NEVER invent, guess, or assume items\n3. Price numbers are PRICES not quantities\n4. Default qty = 1, MAX qty = 5\n5. If customer asks "kya available hai" -> list ACTUAL menu items below\n6. If customer names an item -> recognize as order, ask quantity\n7. If customer corrects -> fix order immediately\n8. NEVER say "menu likhein" or force keywords\n9. Show order summary before confirmation\n10. If unclear -> ASK, never guess\n\nRestaurant: ' + restaurant.name + '\nPhone: ' + restaurant.phone + '\nStatus: ' + (isOpen ? 'OPEN' : 'CLOSED') + '\nDelivery: Rs. ' + (restaurant.delivery_fee_default || 100) + '\n\nACTUAL MENU:\n' + menuText + '\n\nDEALS:\n' + dealsText + cartText + '\n\nCustomer: ' + (customer?.name || 'Naya customer');
}

async function parseCustomerMessage(message, menuItems, cart = []) {
  try {
    const menuSummary = menuItems.map(m => m.name + ' (Rs. ' + m.price + ')').join(', ');
    const systemPrompt = 'Parse customer message. Return ONLY JSON.\n\nSTRICT RULES:\n1. ONLY add items customer EXPLICITLY requested\n2. NEVER invent items\n3. Price = PRICE not qty\n4. Default qty = 1, MAX = 5\n5. "kya hai/available" -> action "chat"\n6. "nahi sirf X" -> action "correct" with items=[X]\n7. "remove X" -> action "remove" with remove_items=[X]\n8. "X 2 kar do" -> action "update_qty"\n9. "done" -> action "checkout"\n\nMenu: ' + menuSummary + '\n\nReturn: {"action":"chat|add_items|checkout|confirm|cancel|correct|remove|update_qty","items":[{"name":"exact","qty":1}],"remove_items":[],"update_qty":null,"order_type":null,"customer_name":null,"customer_phone":null,"customer_address":null,"wants_to_checkout":false,"wants_to_confirm":false,"wants_to_cancel":false}';

    const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }];
    let response = null;

    if (GROQ_API_KEY) { try { response = await callGroq(messages, 0, 300); } catch (e) {} }
    if (!response && zaiInstance) {
      const c = await zaiInstance.chat.completions.create({ messages, thinking: { type: 'disabled' }, temperature: 0, max_tokens: 300 });
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

function basicParseMessage(message, menuItems, cart = []) {
  const lower = message.toLowerCase().trim();
  const result = { action: 'chat', items: [], order_type: null, customer_name: null, customer_phone: null, customer_address: null, wants_to_checkout: false, wants_to_confirm: false, wants_to_cancel: false, remove_items: [], update_qty: null };

  if (/^(cancel|nahi chahiye|rok do)/.test(lower)) { result.action = 'cancel'; result.wants_to_cancel = true; return result; }
  if (/^(confirm|haan|ok|pakka|kar do)/.test(lower)) { result.action = 'confirm'; result.wants_to_confirm = true; return result; }
  if (/^(done|ho gaya|bas itna|finish|bas yehi)/.test(lower)) { result.action = 'checkout'; result.wants_to_checkout = true; return result; }
  if (lower.includes('nahi') && lower.includes('sirf')) { result.action = 'correct'; for (const mi of menuItems) { if (lower.includes(mi.name.toLowerCase())) { result.items = [{ item_id: mi.id, name: mi.name, price: mi.price, qty: 1 }]; break; } } return result; }
  if (lower.includes('remove') || lower.includes('hata') || lower.includes('hatao')) { result.action = 'remove'; for (const mi of menuItems) { if (lower.includes(mi.name.toLowerCase())) { result.remove_items = [mi.name]; break; } } return result; }
  const qm = lower.match(/(\d+)\s*kar\s*do/) || lower.match(/quantity\s*(\d+)/);
  if (qm) { const nq = Math.min(parseInt(qm[1]), 5); for (const mi of menuItems) { if (lower.includes(mi.name.toLowerCase())) { result.action = 'update_qty'; result.update_qty = { item_name: mi.name, new_qty: nq }; break; } } if (result.action === 'update_qty') return result; }
  if (lower === '1' || lower.includes('deliver')) { result.order_type = 'delivery'; result.action = 'add_items'; return result; }
  if (lower === '2' || lower.includes('pickup')) { result.order_type = 'pickup'; result.action = 'add_items'; return result; }
  const orderWords = ['chahiye', 'kar do', 'kardo', 'de do', 'dedo', 'laga do', 'bana do', 'order', 'mujhe', 'merko', 'khila', 'lagao'];
  if (orderWords.some(w => lower.includes(w))) {
    for (const mi of menuItems) { if (lower.includes(mi.name.toLowerCase())) { let q = 1; const qx = message.match(new RegExp('(\\d+)\\s*x\\s*' + mi.name, 'i')); if (qx) q = parseInt(qx[1]); if (q > 5) q = 5; if (q < 1) q = 1; result.action = 'add_items'; result.items = [{ item_id: mi.id, name: mi.name, price: mi.price, qty: q }]; break; } }
  }
  const pm = message.match(/(?:\+?92|0)(3\d{9})/); if (pm) result.customer_phone = '0' + pm[1];
  return result;
}

function getFallbackResponse(message, context = {}) {
  const lower = (message || '').toLowerCase().trim();
  const cart = context.cart || [], isOpen = context.isOpen !== false;
  const restaurant = context.restaurant || {}, menuItems = context.menuItems || [];
  if (!lower) return 'Bataiye, kya help karoon? 😊';
  if (/^(salam|assalam|salaam|hi+|hello+|hey+|aoa|adab)/.test(lower)) return 'Walaikum salam! 🌟\n\n' + (restaurant.name || 'Restaurant') + ' mein khush aamdeed! 😊\n\nKya order karna chahenge?';
  
  // Menu questions - handle BOTH "kia" and "kya" spellings
  if (lower.includes('kya kya') || lower.includes('kia kia') || lower.includes('kya available') || lower.includes('kia available') || lower.includes('kya hai') || lower.includes('kia hai') || lower.includes('kya mojood') || lower.includes('kia mojood') || lower.includes('kya khilaoge') || lower.includes('kia khilaoge') || lower.includes('kya milega') || lower.includes('kia milega') || lower.includes('menu') || lower.includes('options') || lower.includes('list') || lower.includes('paas kya') || lower.includes('paas kia') || lower.includes('kya kya mojood') || lower.includes('kia kia mojood') || lower.includes('kya chahiye') || lower.includes('kia chahiye')) {
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
  if (lower.includes('order') || lower.includes('bhook')) { if (!isOpen) return 'Maaf kijiye, restaurant abhi band hai. 😔'; return 'Bilkul! 🛒 Bataiye kya order karna hai? 😊'; }
  if (/^(done|ho gaya|bas itna|finish)/.test(lower)) {
    if (cart.length === 0) return 'Cart khaali hai! Pehle kuch add karein. 😊';
    let m = 'Aap ka Order:\n\n', s = 0; cart.forEach((i, x) => { m += (x+1) + '. ' + i.qty + 'x ' + i.name + ' - Rs. ' + (i.qty*i.price) + '\n'; s += i.qty*i.price; });
    return m + '\n*Total: Rs. ' + s + '*\n\nConfirm karein?';
  }
  if (lower.includes('nahi') && lower.includes('sirf')) return 'Maaf kijiye! Order correct kar raha hoon. 😊';
  if (lower.includes('remove') || lower.includes('hata')) return 'Theek hai, remove kar diya. 😊';
  if (/^(confirm|haan|ok)/.test(lower)) return 'Order confirm ho gaya! 🎉 Shukriya! 😊';
  if (/(hours|timing|khulta)/.test(lower)) return 'Hum 11 AM se 11 PM tak khule hain. ⏰';
  if (/(address|location|kahan)/.test(lower)) return 'Address: ' + (restaurant.address || 'N/A') + ' 📍';
  if (/(payment|cash|card|easypaisa)/.test(lower)) return 'Payment: 💵 Cash | 📱 EasyPaisa/JazzCash 😊';
  const mi = menuItems.find(m => lower.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(lower));
  if (mi) return mi.name + ' - Rs. ' + mi.price + ' ✅\n\nKitne chahiye? 😊';
  
  // If nothing matched but restaurant has menu, SHOW MENU (not generic reply)
  if (menuItems.length > 0 && lower.length > 3) {
    let msg = 'Hamare paas yeh available hai:\n\n'; const cats = {};
    menuItems.forEach(i => { const c = i.category_name || 'Other'; if (!cats[c]) cats[c] = []; cats[c].push('• ' + i.name + ' - Rs. ' + i.price); });
    Object.entries(cats).forEach(([c, items]) => { msg += '*' + c + '*\n' + items.join('\n') + '\n\n'; });
    msg += 'Kya order karna chahenge? 😊'; return msg;
  }
  
  return 'Bataiye, kya help karoon? 😊';
}

module.exports = { generateResponse, getFallbackResponse, parseCustomerMessage, basicParseMessage, buildSystemPrompt, isAIAvailable, getZAI };
