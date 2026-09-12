/**
 * Conversational Bot Message Handler
 * 
 * Bot chats like a real human - handles small talk, casual chat,
 * order management, recommendations, FAQs, etc.
 * 
 * Uses Roman English throughout for natural Pakistani/Indian customers.
 */

const responses = require('./responses');
const config = require('../config');

// Lazy-loaded modules
let _db = null;
let _waManager = null;
let _generateId = null;

function getDB() {
  if (!_db) {
    const dbModule = require('../db');
    _db = dbModule.db;
    _generateId = dbModule.generateId;
  }
  return _db;
}

function getWAManager() {
  if (!_waManager) {
    _waManager = require('../whatsapp/manager');
  }
  return _waManager;
}

// Statement cache
const stmtCache = new Map();
function prepare(sql) {
  const db = getDB();
  if (!stmtCache.has(sql)) {
    stmtCache.set(sql, db.prepare(sql));
  }
  return stmtCache.get(sql);
}

// ==================== NATURAL LANGUAGE UNDERSTANDING ====================

/**
 * Detect intent from customer message
 */
function detectIntent(text) {
  const lower = text.toLowerCase().trim();
  
  // Empty message
  if (!lower) return 'empty';
  
  // Just emoji
  if (/^[\p{Emoji}\s]+$/u.test(lower) && lower.length < 10) return 'emoji';
  
  // Greetings
  if (/^(salam|assalam|assalamualaikum|assalam o alaikum|salaam|hi+|hello+|hey+|yo|aoa|hola|adab|mashallah|good (morning|afternoon|evening))\b/.test(lower)) {
    return 'greeting';
  }
  
  // How are you
  if (/(kaise? ho|kya haal|how are you|kaisa hai|kya hal hai|how's it going|kya scene|kya haal hai)/.test(lower)) {
    return 'how_are_you';
  }
  
  // Thanks
  if (/(shukriya|shukar|thank|thanks|thx|bohat shukriya|appreciate)/.test(lower)) {
    return 'thanks';
  }
  
  // Goodbye
  if (/(allah hafiz|khuda hafiz|bye+|goodbye|take care|phir milte|alvida|see you)/.test(lower)) {
    return 'goodbye';
  }
  
  // Compliments (catch strong positives before yes/ok)
  if (/(zabardast|mast|kamaal|best|love|nice|wah|wao|wow|mazedaar|perfect|great|awesome|superb|bohat acha|bohat accha)/.test(lower)) {
    return 'compliment';
  }
  
  // "acha bot" type phrases = compliment about bot
  if (/(acha bot|accha bot|acha hai|accha hai|bot acha|bot accha)/.test(lower)) {
    return 'compliment';
  }
  
  // Yes/OK (including just "acha" alone)
  if (/^(haan|han|yes|yeah|yep|ok+|okay|theek|teek|achha|acha|jee|sahi|right|pakka)\b/.test(lower)) {
    return 'yes_ok';
  }
  
  // No/Negative
  if (/^(nahi|nahin|no|na|nah|nopes)\b/.test(lower)) {
    return 'no';
  }
  
  // Bot identity questions
  if (/(kaun ho|who are you|tum kaun|tu kaun|bot ho|kya tum bot|are you bot|kon ho|ap kaun|aap kaun)/.test(lower)) {
    return 'who_are_you';
  }
  
  if (/(insaan ho|bot ho|robot ho|machine ho|are you human|real insaan|tum insaan)/.test(lower)) {
    return 'human_or_bot';
  }
  
  // Hungry
  if (/(bhook|bhuk|hungry|khana|kuch khana|pet khaali|starving)/.test(lower)) {
    return 'hungry';
  }
  
  // Menu commands
  if (/^(menu|cart|items|kya hai|kya kya|list)\b/.test(lower)) {
    return 'menu';
  }
  
  // Order commands (including "mujhe X chahiye" pattern)
  if (/^(order|new order|place order|kar do order|order karna|khana order)\b/.test(lower)) {
    return 'order';
  }
  
  // "mujhe X chahiye" / "merko X chahiye" - customer wants something specific
  if (/(mujhe|merko|mujh ko|mera|chahiye|chahiyeh|chahta|chahti|de do|de dein|laga do|bana do|chahiye ga)/.test(lower)) {
    return 'want_item';
  }
  
  // Status commands
  if (/^(status|order kya hua|kahan hai|track|where is my order)\b/.test(lower)) {
    return 'status';
  }
  
  // Cancel
  if (/^(cancel|cancel karo|cancel kar do|order cancel|rok do)\b/.test(lower)) {
    return 'cancel';
  }
  
  // Hours/Timing
  if (/(hours|timing|khulta|band|kya waqt|open|close|kab khulta|kab band)\b/.test(lower)) {
    return 'hours';
  }
  
  // Address/Location
  if (/(address|location|kahan|kahan par|kahaan|where|location bata|address kya)\b/.test(lower)) {
    return 'address';
  }
  
  // Payment
  if (/(payment|cash|card|easypaisa|jazzcash|bank|paise|paisa|pay|online pay|kesy pay)\b/.test(lower)) {
    return 'payment';
  }
  
  // Delivery
  if (/(delivery|deliver|ghar par|deliver karo|delivery karni|home delivery|deliver karega)\b/.test(lower)) {
    return 'delivery_info';
  }
  
  // Help
  if (/^(help|madad|support|kaise|kya kare|kaise kare)\b/.test(lower)) {
    return 'help';
  }
  
  // Recommendations - what's good/special/best
  if (/(kya acha|best|special|recommend|favorite|favourite|acha kya|pasand|kya khilaoo|kya khilao|specialty|speciality|famous|popular)\b/.test(lower)) {
    return 'recommend';
  }
  
  // Asking about specific dish (description)
  if (/(kya hai|what is|ingredients|kya milta|recipe|kya cheez|kaise banta)\b/.test(lower)) {
    return 'dish_info';
  }
  
  // Price inquiry
  if (/(qeemat|price|kitne ka|kitna|kitne|kitni|cost|rate|kya daam|kitne ki|kitni ki)\b/.test(lower)) {
    return 'price_query';
  }
  
  // Remove item
  if (/^(remove|delete|hata|hatao|nikal|cancel item|remove item)\b/.test(lower)) {
    return 'remove_item';
  }
  
  // Clear cart
  if (/^(clear|clear cart|empty cart|sab hata|sab clear)\b/.test(lower)) {
    return 'clear_cart';
  }
  
  // Done/checkout
  if (/^(done|finish|complete|checkout|ho gaya|bas itna|khatam)\b/.test(lower)) {
    return 'done';
  }
  
  // Confirm
  if (/^(confirm|confirm karein|yes confirm|ok confirm)\b/.test(lower)) {
    return 'confirm';
  }
  
  return 'unknown';
}

/**
 * Parse quantity from message
 */
function parseQuantityAndName(message) {
  let qty = 1;
  let name = message.trim();

  let match = message.match(/^(\d+)\s*x\s*(.+)$/i);
  if (match) {
    qty = parseInt(match[1]);
    name = match[2].trim();
    return { qty, name };
  }

  match = message.match(/^(.+?)\s*x?\s*(\d+)$/i);
  if (match) {
    qty = parseInt(match[2]);
    name = match[1].trim();
    return { qty, name };
  }

  return { qty: 1, name: message.trim() };
}

/**
 * Find menu item by name (fuzzy match)
 */
function findMenuItem(restaurantId, itemName) {
  const items = prepare('SELECT * FROM menu_items WHERE restaurant_id = ? AND is_available = 1').all(restaurantId);
  const lower = itemName.toLowerCase().trim();

  // Exact match
  let found = items.find(i => i.name.toLowerCase() === lower);
  if (found) return found;

  // Contains match
  found = items.find(i => i.name.toLowerCase().includes(lower) || lower.includes(i.name.toLowerCase()));
  if (found) return found;

  // Word match
  const words = lower.split(/\s+/).filter(w => w.length > 2);
  found = items.find(i => {
    const itemNameWords = i.name.toLowerCase().split(/\s+/);
    return words.some(w => itemNameWords.some(iw => iw.includes(w) || w.includes(iw)));
  });

  return found || null;
}

/**
 * Get or create customer
 */
function getOrCreateCustomer(restaurantId, phone, name) {
  const selectStmt = prepare('SELECT * FROM customers WHERE restaurant_id = ? AND phone = ?');
  let customer = selectStmt.get(restaurantId, phone);
  if (!customer) {
    const id = _generateId('cust_');
    prepare('INSERT INTO customers (id, restaurant_id, phone, name) VALUES (?, ?, ?, ?)')
      .run(id, restaurantId, phone, name || null);
    customer = selectStmt.get(restaurantId, phone);
  } else if (name && !customer.name) {
    prepare('UPDATE customers SET name = ? WHERE id = ?').run(name, customer.id);
    customer.name = name;
  }
  return customer;
}

/**
 * Get or create conversation state
 */
function getOrCreateConversation(restaurantId, phone) {
  const selectStmt = prepare('SELECT * FROM bot_conversations WHERE restaurant_id = ? AND customer_phone = ?');
  let conv = selectStmt.get(restaurantId, phone);
  if (!conv) {
    const id = _generateId('conv_');
    prepare('INSERT INTO bot_conversations (id, restaurant_id, customer_phone, state, cart_json) VALUES (?, ?, ?, ?, ?)')
      .run(id, restaurantId, phone, 'idle', '[]');
    conv = selectStmt.get(restaurantId, phone);
  }
  return conv;
}

/**
 * Update conversation state
 */
function updateConversation(restaurantId, phone, updates) {
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  prepare(`UPDATE bot_conversations SET ${setClauses}, last_message_at = CURRENT_TIMESTAMP WHERE restaurant_id = ? AND customer_phone = ?`)
    .run(...values, restaurantId, phone);
}

/**
 * Calculate cart subtotal
 */
function calculateSubtotal(cart) {
  return cart.reduce((sum, item) => sum + (item.qty * item.price), 0);
}

/**
 * Send message with typing simulation
 */
async function sendTextWithDelay(sock, jid, text, options = {}) {
  try {
    // Simulate typing based on message length
    const typingMs = Math.min(Math.max(text.length * 20, 800), 3000);
    
    // Show typing indicator
    if (typeof sock.sendPresenceUpdate === 'function') {
      try {
        await sock.sendPresenceUpdate('composing', jid);
      } catch (e) {
        // ignore
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, typingMs));
    
    // Stop typing
    if (typeof sock.sendPresenceUpdate === 'function') {
      try {
        await sock.sendPresenceUpdate('paused', jid);
      } catch (e) {
        // ignore
      }
    }
    
    await sock.sendMessage(jid, { text });
  } catch (e) {
    console.error('[Bot] Send error:', e.message);
    try {
      await sock.sendMessage(jid, { text });
    } catch (e2) {
      console.error('[Bot] Send retry failed:', e2.message);
    }
  }
}

/**
 * Quick send (no typing delay)
 */
async function sendText(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text });
  } catch (e) {
    console.error('[Bot] Send error:', e.message);
  }
}

/**
 * Get random element from array
 */
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get top selling items for recommendations
 */
function getTopItems(restaurantId, limit = 4) {
  try {
    return prepare(`
      SELECT 
        mi.id, mi.name, mi.price, mi.description,
        COUNT(o.id) as order_count
      FROM menu_items mi
      LEFT JOIN orders o ON o.restaurant_id = mi.restaurant_id 
        AND o.items_json LIKE '%"' || mi.name || '"%'
        AND o.status != 'cancelled'
      WHERE mi.restaurant_id = ? AND mi.is_available = 1
      GROUP BY mi.id
      ORDER BY order_count DESC, mi.name ASC
      LIMIT ?
    `).all(restaurantId, limit);
  } catch (e) {
    // Fallback to first few items
    return prepare('SELECT id, name, price, description FROM menu_items WHERE restaurant_id = ? AND is_available = 1 ORDER BY name LIMIT ?').all(restaurantId, limit);
  }
}

/**
 * Handle customer message
 */
async function handleMessage(sock, messageUpsert, restaurantId) {
  try {
    restaurantId = String(restaurantId);
    const messages = messageUpsert.messages;
    if (!messages || messages.length === 0) return;

    const msg = messages[0];
    if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') {
      return;
    }

    const conversation = msg.message.conversation || 
                       msg.message.extendedTextMessage?.text ||
                       msg.message.imageMessage?.caption ||
                       msg.message.videoMessage?.caption ||
                       '';

    const text = (conversation || '').trim();
    
    const phone = String(msg.key.remoteJid || '').split('@')[0];
    if (!phone) return;

    const restaurant = prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
    if (!restaurant || !restaurant.is_active) return;

    try {
      await sock.readMessages([msg.key]);
    } catch (e) {
      // ignore
    }

    const customer = getOrCreateCustomer(restaurantId, phone, null);
    prepare('UPDATE customers SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(customer.id);

    let conv = getOrCreateConversation(restaurantId, phone);

    // Check for session timeout
    const lastMsgTime = new Date(conv.last_message_at || Date.now()).getTime();
    const now = Date.now();
    const minutesSinceLast = (now - lastMsgTime) / 60000;
    
    if (minutesSinceLast > config.BOT.ORDER_SESSION_TIMEOUT && conv.state !== 'idle') {
      updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null });
      conv = getOrCreateConversation(restaurantId, phone);
      await sendTextWithDelay(sock, msg.key.remoteJid, responses.timeout());
    }

    // Detect intent
    const intent = detectIntent(text);
    
    // Get hour for time-based greetings
    const hour = new Date().getHours();

    // Handle intent (some intents override state machine)
    switch (intent) {
      case 'empty':
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.smallTalk.emptyMessage());
        return;
        
      case 'emoji':
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.smallTalk.emojiOnly());
        return;
        
      case 'greeting':
        if (customer.name) {
          // Get last order info
          const lastOrder = prepare('SELECT created_at FROM orders WHERE restaurant_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 1').get(restaurantId, customer.id);
          let lastOrderDays = null;
          if (lastOrder) {
            const daysAgo = Math.floor((now - new Date(lastOrder.created_at).getTime()) / 86400000);
            lastOrderDays = daysAgo;
          }
          await sendTextWithDelay(sock, msg.key.remoteJid, responses.welcomeBack(restaurant.name, customer.name, lastOrderDays));
        } else {
          await sendTextWithDelay(sock, msg.key.remoteJid, responses.greeting(restaurant.name));
        }
        return;
        
      case 'how_are_you':
        await sendTextWithDelay(sock, msg.key.remoteJid, randomChoice(responses.smallTalk.howAreYou));
        return;
        
      case 'thanks':
        await sendTextWithDelay(sock, msg.key.remoteJid, randomChoice(responses.smallTalk.thanks));
        return;
        
      case 'goodbye':
        await sendTextWithDelay(sock, msg.key.remoteJid, randomChoice(responses.smallTalk.goodbye));
        return;
        
      case 'who_are_you':
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.smallTalk.whoAreYou(restaurant.name));
        return;
        
      case 'human_or_bot':
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.smallTalk.areYouBot(restaurant.name));
        return;
        
      case 'compliment':
        // If customer is mid-order and says "acha" etc., might be confirming
        if (conv.state === 'awaiting_confirmation') {
          // Treat as confirm
          await finalizeOrder(sock, msg.key.remoteJid, restaurantId, phone, conv);
          return;
        }
        await sendTextWithDelay(sock, msg.key.remoteJid, randomChoice(responses.smallTalk.compliment));
        return;
        
      case 'hungry':
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.smallTalk.hungry());
        return;
        
      case 'help':
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.help());
        return;
        
      case 'hours':
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.hours(restaurant.name));
        return;
        
      case 'address':
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.address(restaurant.name, restaurant.address));
        return;
        
      case 'contact':
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.contact(restaurant.name, restaurant.phone, restaurant.address));
        return;
        
      case 'payment':
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.payment());
        return;
        
      case 'delivery_info':
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.deliveryInfo());
        return;
        
      case 'recommend':
        const topItems = getTopItems(restaurantId, 4);
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.recommendItems(topItems));
        return;
        
      case 'want_item':
        // "mujhe pizza chahiye" -> extract "pizza" and start ordering
        await handleWantItem(sock, msg.key.remoteJid, restaurantId, phone, text, conv);
        return;
        
      case 'cancel':
        updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null });
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.orderCancelled());
        return;
        
      case 'menu':
        if (conv.state === 'ordering' && text.toLowerCase().trim() === 'cart') {
          await showCart(sock, msg.key.remoteJid, restaurantId, phone);
          return;
        }
        await showMenu(sock, msg.key.remoteJid, restaurantId);
        return;
    }

    // Handle based on conversation state
    switch (conv.state) {
      case 'idle':
        if (intent === 'order') {
          updateConversation(restaurantId, phone, { state: 'ordering', cart_json: '[]' });
          await sendTextWithDelay(sock, msg.key.remoteJid, responses.orderStarted(customer.name));
        } else if (intent === 'status') {
          await showLastOrderStatus(sock, msg.key.remoteJid, restaurantId, customer.id);
        } else if (intent === 'yes_ok') {
          await sendTextWithDelay(sock, msg.key.remoteJid, randomChoice(responses.smallTalk.yesOk));
        } else if (intent === 'no') {
          await sendTextWithDelay(sock, msg.key.remoteJid, 'Theek hai! Kuch aur chahiye toh bataiye. 😊');
        } else if (intent === 'dish_info' || intent === 'price_query') {
          // Try to extract item name from message
          await handleDishQuery(sock, msg.key.remoteJid, restaurantId, text, intent);
        } else if (intent === 'unknown') {
          // Try to parse as order item
          const { qty, name } = parseQuantityAndName(text);
          const menuItem = findMenuItem(restaurantId, name);
          if (menuItem) {
            // Start ordering automatically
            updateConversation(restaurantId, phone, { state: 'ordering', cart_json: '[]' });
            await addItemToCart(sock, msg.key.remoteJid, restaurantId, phone, menuItem, qty, []);
          } else {
            // Send small talk response
            await sendTextWithDelay(sock, msg.key.remoteJid, responses.smallTalk.didntUnderstand());
          }
        } else {
          // For other intents when idle, just greet
          if (customer.name) {
            await sendTextWithDelay(sock, msg.key.remoteJid, responses.welcomeBack(restaurant.name, customer.name, null));
          } else {
            await sendTextWithDelay(sock, msg.key.remoteJid, responses.greeting(restaurant.name));
          }
        }
        break;

      case 'ordering':
        await handleOrderingState(sock, msg.key.remoteJid, restaurantId, phone, text, conv, intent, customer);
        break;

      case 'awaiting_order_type':
        await handleOrderTypeChoice(sock, msg.key.remoteJid, restaurantId, phone, text, conv, intent);
        break;

      case 'awaiting_name':
        if (intent === 'cancel') {
          updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null });
          await sendTextWithDelay(sock, msg.key.remoteJid, responses.orderCancelled());
          return;
        }
        updateConversation(restaurantId, phone, { state: 'awaiting_address' });
        prepare('UPDATE customers SET name = ? WHERE id = ?').run(text.trim(), customer.id);
        if (conv.order_type === 'delivery') {
          await sendTextWithDelay(sock, msg.key.remoteJid, responses.askAddress());
        } else {
          await sendTextWithDelay(sock, msg.key.remoteJid, `Phone number bata dijiye delivery confirmation k liye:\nExample: 03001234567`);
        }
        break;

      case 'awaiting_address':
        if (intent === 'cancel') {
          updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null });
          await sendTextWithDelay(sock, msg.key.remoteJid, responses.orderCancelled());
          return;
        }
        if (conv.order_type === 'delivery') {
          updateConversation(restaurantId, phone, { state: 'awaiting_phone' });
          prepare('UPDATE bot_conversations SET notes = ? WHERE id = ?').run(text.trim(), conv.id);
          await sendTextWithDelay(sock, msg.key.remoteJid, responses.askPhone());
        } else {
          await sendTextWithDelay(sock, msg.key.remoteJid, responses.askPhone());
        }
        break;

      case 'awaiting_phone':
        if (intent === 'cancel') {
          updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null });
          await sendTextWithDelay(sock, msg.key.remoteJid, responses.orderCancelled());
          return;
        }
        await saveAndConfirmOrder(sock, msg.key.remoteJid, restaurantId, phone, text.trim(), conv, customer);
        break;

      case 'awaiting_confirmation':
        if (intent === 'confirm' || intent === 'yes_ok' || intent === 'compliment') {
          await finalizeOrder(sock, msg.key.remoteJid, restaurantId, phone, conv);
        } else if (intent === 'cancel' || intent === 'no') {
          updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null });
          await sendTextWithDelay(sock, msg.key.remoteJid, responses.orderCancelled());
        } else if (intent === 'menu') {
          await showMenu(sock, msg.key.remoteJid, restaurantId);
        } else {
          await sendTextWithDelay(sock, msg.key.remoteJid, `Bhai, *confirm* ya *cancel* likhein. 🙏\n\nKuch change karna ho toh bata dein!`);
        }
        break;

      default:
        updateConversation(restaurantId, phone, { state: 'idle' });
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.greeting(restaurant.name));
    }
  } catch (e) {
    console.error('[Bot] handleMessage error:', e.message);
  }
}

/**
 * Handle dish info / price query
 */
async function handleDishQuery(sock, jid, restaurantId, text, intent) {
  // Remove question words from message
  let cleanText = text.toLowerCase()
    .replace(/kya hai|what is|ingredients|kya milta|recipe|kya cheez|kaise banta/g, '')
    .replace(/qeemat|price|kitne ka|kitna|kitne|kitni|cost|rate|kya daam|kitne ki|kitni ki/g, '')
    .replace(/[?؟]/g, '')
    .trim();
  
  const menuItem = findMenuItem(restaurantId, cleanText);
  if (menuItem) {
    if (intent === 'price_query') {
      await sendTextWithDelay(sock, jid, responses.smallTalk.priceQuery(menuItem));
    } else {
      await sendTextWithDelay(sock, jid, responses.smallTalk.dishInfo(menuItem));
    }
  } else {
    await sendTextWithDelay(sock, jid, `Yeh item menu mein nahi mila. 😅\n\n*menu* likh kar menu dekhein!`);
  }
}

/**
 * Handle "mujhe X chahiye" - extract item and start ordering
 */
async function handleWantItem(sock, jid, restaurantId, phone, text, conv) {
  // Remove filler words to extract item name
  let itemName = text.toLowerCase()
    .replace(/mujhe|merko|mujh ko|mera|chahiye|chahiyeh|chahta|chahti|de do|de dein|laga do|bana do|chahiye ga|ek|do|char|aik|tho/g, '')
    .replace(/\d+\s*x?\s*/g, '') // remove quantities
    .replace(/[?؟!.,]/g, '')
    .trim();
  
  // Try to find item
  const menuItem = findMenuItem(restaurantId, itemName);
  if (!menuItem) {
    await sendTextWithDelay(sock, jid, `Aray, "${itemName}" humare menu mein nahi mila. 😅\n\n*menu* likh kar menu dekhein!`);
    return;
  }
  
  // Check quantity in original message
  let qty = 1;
  const qtyMatch = text.match(/(\d+)\s*x?\s*(?:plate|portion|piece|burger|pizza)/i) || text.match(/(\d+)/);
  if (qtyMatch) {
    qty = Math.min(parseInt(qtyMatch[1]), 20);
  }
  
  // If not in ordering state, start ordering
  if (conv.state !== 'ordering') {
    updateConversation(restaurantId, phone, { state: 'ordering', cart_json: '[]' });
  }
  
  const cart = JSON.parse(conv.cart_json || '[]');
  await addItemToCart(sock, jid, restaurantId, phone, menuItem, qty, cart);
}

/**
 * Handle ordering state with item management
 */
async function handleOrderingState(sock, jid, restaurantId, phone, text, conv, intent, customer) {
  const lowerText = text.toLowerCase().trim();

  // Done/checkout
  if (intent === 'done') {
    const cart = JSON.parse(conv.cart_json || '[]');
    if (cart.length === 0) {
      await sendTextWithDelay(sock, jid, responses.cartEmpty());
      return;
    }
    updateConversation(restaurantId, phone, { state: 'awaiting_order_type' });
    await sendTextWithDelay(sock, jid, responses.askOrderType());
    return;
  }

  // Show cart
  if (lowerText === 'cart') {
    await showCart(sock, jid, restaurantId, phone);
    return;
  }

  // Remove item
  if (intent === 'remove_item') {
    await handleRemoveItem(sock, jid, restaurantId, phone, text, conv);
    return;
  }

  // Clear cart
  if (intent === 'clear_cart') {
    updateConversation(restaurantId, phone, { cart_json: '[]' });
    await sendTextWithDelay(sock, jid, responses.cartCleared());
    return;
  }

  // Show menu
  if (intent === 'menu') {
    await showMenu(sock, jid, restaurantId);
    return;
  }

  // Cancel
  if (intent === 'cancel') {
    updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null });
    await sendTextWithDelay(sock, jid, responses.orderCancelled());
    return;
  }

  // Status check
  if (intent === 'status') {
    await showLastOrderStatus(sock, jid, restaurantId, customer.id);
    return;
  }

  // Recommend
  if (intent === 'recommend') {
    const topItems = getTopItems(restaurantId, 4);
    await sendTextWithDelay(sock, jid, responses.recommendItems(topItems));
    return;
  }

  // Small talk during ordering - don't break flow
  if (intent === 'thanks') {
    await sendTextWithDelay(sock, jid, randomChoice(responses.smallTalk.thanks));
    return;
  }
  if (intent === 'how_are_you') {
    await sendTextWithDelay(sock, jid, randomChoice(responses.smallTalk.howAreYou));
    return;
  }

  // Try to parse as item
  const { qty, name } = parseQuantityAndName(text);
  if (qty < 1 || qty > 20) {
    await sendTextWithDelay(sock, jid, `⚠️ Quantity 1 se 20 tak ho sakti hai bhai. 😅`);
    return;
  }

  const menuItem = findMenuItem(restaurantId, name);
  if (!menuItem) {
    await sendTextWithDelay(sock, jid, responses.itemNotFound(name));
    return;
  }

  const cart = JSON.parse(conv.cart_json || '[]');
  await addItemToCart(sock, jid, restaurantId, phone, menuItem, qty, cart);
}

/**
 * Add item to cart and send confirmation
 */
async function addItemToCart(sock, jid, restaurantId, phone, menuItem, qty, cart) {
  const existing = cart.find(c => c.item_id === menuItem.id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      item_id: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      qty: qty
    });
  }
  
  const updatedCart = JSON.stringify(cart);
  updateConversation(restaurantId, phone, { cart_json: updatedCart });
  
  const cartCount = cart.length;
  const subtotal = calculateSubtotal(cart);
  const lastAdded = cart.find(c => c.item_id === menuItem.id);
  await sendTextWithDelay(sock, jid, responses.itemAdded(lastAdded, cartCount, subtotal));
}

/**
 * Handle remove item from cart
 */
async function handleRemoveItem(sock, jid, restaurantId, phone, text, conv) {
  const cart = JSON.parse(conv.cart_json || '[]');
  if (cart.length === 0) {
    await sendTextWithDelay(sock, jid, responses.cartEmpty());
    return;
  }

  // Extract item name after "remove"
  let itemName = text.toLowerCase().replace(/^(remove|delete|hata|hatao|nikal|cancel item|remove item)\s*/i, '').trim();
  
  if (!itemName) {
    // Show cart and ask which item to remove
    let msg = `Kaun sa item remove karoon? 🤔\n\n`;
    cart.forEach((item, i) => {
      msg += `${i + 1}. ${item.qty}x ${item.name}\n`;
    });
    msg += `\nItem ka naam ya number likhein!`;
    await sendTextWithDelay(sock, jid, msg);
    return;
  }

  // Try by number
  const num = parseInt(itemName);
  if (!isNaN(num) && num >= 1 && num <= cart.length) {
    const removed = cart.splice(num - 1, 1)[0];
    updateConversation(restaurantId, phone, { cart_json: JSON.stringify(cart) });
    await sendTextWithDelay(sock, jid, responses.itemRemoved(removed.name, cart));
    return;
  }

  // Try by name
  const idx = cart.findIndex(c => 
    c.name.toLowerCase().includes(itemName) || itemName.includes(c.name.toLowerCase())
  );
  
  if (idx >= 0) {
    const removed = cart.splice(idx, 1)[0];
    updateConversation(restaurantId, phone, { cart_json: JSON.stringify(cart) });
    await sendTextWithDelay(sock, jid, responses.itemRemoved(removed.name, cart));
  } else {
    await sendTextWithDelay(sock, jid, responses.itemNotInCart(itemName));
  }
}

/**
 * Show cart
 */
async function showCart(sock, jid, restaurantId, phone) {
  const conv = getOrCreateConversation(restaurantId, phone);
  const cart = JSON.parse(conv.cart_json || '[]');
  if (cart.length === 0) {
    await sendTextWithDelay(sock, jid, responses.cartEmpty());
    return;
  }
  const subtotal = calculateSubtotal(cart);
  await sendTextWithDelay(sock, jid, responses.cartSummary(cart, subtotal));
}

/**
 * Handle order type choice
 */
async function handleOrderTypeChoice(sock, jid, restaurantId, phone, text, conv, intent) {
  const lowerText = text.toLowerCase();

  let orderType = null;
  if (lowerText === '1' || lowerText.includes('deliver')) {
    orderType = 'delivery';
  } else if (lowerText === '2' || lowerText.includes('pick')) {
    orderType = 'pickup';
  } else if (intent === 'cancel') {
    updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null });
    await sendTextWithDelay(sock, jid, responses.orderCancelled());
    return;
  } else {
    await sendTextWithDelay(sock, jid, `Bhai, "1" (delivery) ya "2" (pickup) likhein. 🙏`);
    return;
  }

  updateConversation(restaurantId, phone, { state: 'awaiting_name', order_type: orderType });
  await sendTextWithDelay(sock, jid, responses.askName());
}

/**
 * Save and confirm order
 */
async function saveAndConfirmOrder(sock, jid, restaurantId, phone, phoneInput, conv, customer) {
  const cart = JSON.parse(conv.cart_json || '[]');
  if (cart.length === 0) {
    await sendTextWithDelay(sock, jid, responses.cartEmpty());
    return;
  }

  let cleanPhone = phoneInput.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('92')) {
    cleanPhone = '0' + cleanPhone.substring(2);
  }
  if (!cleanPhone.startsWith('0')) {
    cleanPhone = '0' + cleanPhone;
  }

  const subtotal = calculateSubtotal(cart);
  const deliveryFee = conv.order_type === 'delivery' ? 100 : 0;
  const total = subtotal + deliveryFee;

  const address = conv.notes || null;

  const orderId = _generateId('ord_');
  prepare(`INSERT INTO orders 
    (id, restaurant_id, customer_id, customer_phone, customer_name, customer_address, order_type, items_json, subtotal, delivery_fee, total, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`).run(
    orderId, restaurantId, customer.id, cleanPhone, customer.name, address,
    conv.order_type, JSON.stringify(cart), subtotal, deliveryFee, total
  );

  prepare('INSERT INTO order_status_history (order_id, status) VALUES (?, ?)').run(orderId, 'new');

  prepare('UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + ? WHERE id = ?')
    .run(total, customer.id);

  const orderData = {
    id: orderId,
    items: cart,
    subtotal,
    delivery_fee: deliveryFee,
    total,
    customer_name: customer.name,
    customer_phone: cleanPhone,
    customer_address: address,
    order_type: conv.order_type
  };

  updateConversation(restaurantId, phone, { 
    state: 'awaiting_confirmation',
    cart_json: JSON.stringify({ orderId })
  });

  await sendTextWithDelay(sock, jid, responses.orderConfirmation(orderData));
}

/**
 * Finalize order after customer confirms
 */
async function finalizeOrder(sock, jid, restaurantId, phone, conv) {
  const tempData = JSON.parse(conv.cart_json || '{}');
  if (!tempData.orderId) {
    await sendTextWithDelay(sock, jid, responses.somethingWrong());
    return;
  }

  const order = prepare('SELECT * FROM orders WHERE id = ?').get(tempData.orderId);
  if (!order) {
    await sendTextWithDelay(sock, jid, responses.somethingWrong());
    return;
  }

  prepare("UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
  prepare('INSERT INTO order_status_history (order_id, status) VALUES (?, ?)').run(order.id, 'confirmed');

  await sendTextWithDelay(sock, jid, responses.orderConfirmed(order.id, order.total));

  // Notify restaurant dashboard via socket
  try {
    if (global.socketIO) {
      global.socketIO.emit(`restaurant:new_order:${restaurantId}`, {
        orderId: order.id,
        total: order.total,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        items: JSON.parse(order.items_json)
      });
    }
  } catch (e) {
    console.error('[Bot] Socket emit error:', e.message);
  }

  updateConversation(restaurantId, phone, { 
    state: 'idle', 
    cart_json: '[]', 
    order_type: null,
    notes: null
  });
}

/**
 * Show menu
 */
async function showMenu(sock, jid, restaurantId) {
  const restaurant = prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
  const categories = prepare('SELECT * FROM menu_categories WHERE restaurant_id = ? AND is_active = 1 ORDER BY sort_order').all(restaurantId);
  
  let message = responses.menuHeader(restaurant.name);

  if (categories.length === 0) {
    const items = prepare('SELECT * FROM menu_items WHERE restaurant_id = ? AND is_available = 1 ORDER BY sort_order, name').all(restaurantId);
    if (items.length === 0) {
      message += '\n_Menu khaali hai. Jald update kiya jayega._\n';
    } else {
      items.forEach(item => {
        message += responses.menuItem(item);
      });
    }
  } else {
    categories.forEach(cat => {
      message += responses.menuCategory(cat.name);
      const items = prepare('SELECT * FROM menu_items WHERE restaurant_id = ? AND category_id = ? AND is_available = 1 ORDER BY sort_order, name').all(restaurantId, cat.id);
      if (items.length === 0) {
        message += '  _Jald aa rahe hain_\n';
      } else {
        items.forEach(item => {
          message += responses.menuItem(item);
        });
      }
    });
  }

  message += responses.menuFooter();
  await sendTextWithDelay(sock, jid, message);
}

/**
 * Show last order status
 */
async function showLastOrderStatus(sock, jid, restaurantId, customerId) {
  const order = prepare('SELECT * FROM orders WHERE restaurant_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 1').get(restaurantId, customerId);
  if (!order) {
    await sendTextWithDelay(sock, jid, responses.noOrders());
    return;
  }
  await sendTextWithDelay(sock, jid, responses.lastOrderStatus(order));
}

/**
 * Update order status (called from restaurant dashboard)
 */
async function notifyOrderStatus(restaurantId, orderId, status, reason) {
  restaurantId = String(restaurantId);
  const order = prepare('SELECT * FROM orders WHERE id = ? AND restaurant_id = ?').get(orderId, restaurantId);
  if (!order) return;

  prepare('INSERT INTO order_status_history (order_id, status, note) VALUES (?, ?, ?)').run(orderId, status, reason || null);
  prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, orderId);

  try {
    let message;
    switch (status) {
      case 'confirmed':
        message = responses.statusConfirmed(order.id);
        break;
      case 'preparing':
        message = responses.statusPreparing(order.id);
        break;
      case 'ready':
        message = responses.statusReady(order.id, order.order_type);
        break;
      case 'delivered':
        message = responses.statusDelivered(order.id);
        break;
      case 'cancelled':
        message = responses.statusCancelled(order.id, reason);
        break;
      default:
        return;
    }

    if (message) {
      const wa = getWAManager();
      let jid = order.customer_phone.replace(/[^0-9]/g, '');
      if (order.customer_phone.startsWith('0')) {
        jid = '92' + jid.substring(1);
      }
      jid = jid + '@s.whatsapp.net';
      
      // Get the socket from session
      const session = wa.sessions.get(restaurantId);
      if (session && session.socket) {
        await sendTextWithDelay(session.socket, jid, message);
      } else {
        await wa.sendMessage(restaurantId, jid, message);
      }
    }
  } catch (e) {
    console.error('[Bot] Status notify error:', e.message);
  }
}

module.exports = {
  handleMessage,
  notifyOrderStatus,
  showMenu,
  sendText,
  sendTextWithDelay
};
