/**
 * AI-Powered Human Agent Bot (Roman English)
 * 
 * Features:
 * - Context-aware conversations (remembers what was discussed)
 * - Personality - warm, friendly, helpful, Pakistani style
 * - Smart order management (modifications, deals, variations)
 * - Emotional intelligence (apologetic on delays, excited on orders)
 * - Multi-turn conversations with context
 * - Handles deals, variations, add-ons
 * - Operating hours awareness
 * - Delivery area validation
 * - Customer history personalization
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

const stmtCache = new Map();
function prepare(sql) {
  const db = getDB();
  if (!stmtCache.has(sql)) {
    stmtCache.set(sql, db.prepare(sql));
  }
  return stmtCache.get(sql);
}

// ==================== CONTEXT & MEMORY ====================

/**
 * Get customer context (their history with restaurant)
 */
function getCustomerContext(restaurantId, customerPhone) {
  const customer = prepare('SELECT * FROM customers WHERE restaurant_id = ? AND phone = ?').get(restaurantId, customerPhone);
  if (!customer) return null;
  
  const lastOrder = prepare(`
    SELECT * FROM orders WHERE restaurant_id = ? AND customer_id = ? 
    ORDER BY created_at DESC LIMIT 1
  `).get(restaurantId, customer.id);
  
  const orderCount = prepare('SELECT COUNT(*) as count FROM orders WHERE restaurant_id = ? AND customer_id = ?').get(restaurantId, customer.id);
  
  const favoriteItems = prepare(`
    SELECT json_extract(value, '$.name') as name, 
           SUM(json_extract(value, '$.qty')) as total_qty
    FROM orders, json_each(items_json)
    WHERE restaurant_id = ? AND customer_id = ? AND status != 'cancelled'
    GROUP BY json_extract(value, '$.name')
    ORDER BY total_qty DESC LIMIT 3
  `).all(restaurantId, customer.id);
  
  return {
    customer,
    lastOrder,
    totalOrders: orderCount.count,
    favoriteItems,
    isVIP: orderCount.count >= 10,
    isReturning: orderCount.count > 0
  };
}

/**
 * Get restaurant context (operating status, deals, etc)
 */
function getRestaurantContext(restaurantId) {
  const restaurant = prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
  
  // Check operating hours
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sunday
  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  
  const operatingHours = prepare('SELECT * FROM operating_hours WHERE restaurant_id = ? AND day_of_week = ?').get(restaurantId, dayOfWeek);
  
  let isOpen = true;
  let closingSoon = false;
  if (operatingHours) {
    if (operatingHours.is_closed) {
      isOpen = false;
    } else if (operatingHours.open_time && operatingHours.close_time) {
      isOpen = currentTime >= operatingHours.open_time && currentTime <= operatingHours.close_time;
      // Check if closing within 30 min
      const closeParts = operatingHours.close_time.split(':');
      const closeMins = parseInt(closeParts[0]) * 60 + parseInt(closeParts[1]);
      const nowMins = now.getHours() * 60 + now.getMinutes();
      if (closeMins - nowMins <= 30 && closeMins > nowMins) {
        closingSoon = true;
      }
    }
  }
  
  // Active deals
  const activeDeals = prepare(`
    SELECT * FROM deals WHERE restaurant_id = ? AND is_active = 1 
    AND (valid_from IS NULL OR valid_from <= datetime('now'))
    AND (valid_until IS NULL OR valid_until >= datetime('now'))
    ORDER BY sort_order
  `).all(restaurantId);
  
  return {
    restaurant,
    isOpen,
    closingSoon,
    closingTime: operatingHours?.close_time,
    activeDeals,
    currentTime
  };
}

/**
 * Get item variations
 */
function getItemVariations(itemId) {
  return prepare('SELECT * FROM menu_item_variations WHERE menu_item_id = ? AND is_active = 1 ORDER BY type, is_default DESC').all(itemId);
}

// ==================== INTENT DETECTION ====================

function detectIntent(text) {
  const lower = text.toLowerCase().trim();
  
  if (!lower) return 'empty';
  if (/^[\p{Emoji}\s]+$/u.test(lower) && lower.length < 10) return 'emoji';
  
  // Greetings
  if (/^(salam|assalam|assalamualaikum|assalam o alaikum|salaam|hi+|hello+|hey+|yo|aoa|hola|adab|good (morning|afternoon|evening))\b/.test(lower)) {
    return 'greeting';
  }
  
  if (/(kaise? ho|kya haal|how are you|kaisa hai|kya hal hai|how's it going)/.test(lower)) return 'how_are_you';
  if (/(shukriya|shukar|thank|thanks|thx|bohat shukriya|appreciate)/.test(lower)) return 'thanks';
  if (/(allah hafiz|khuda hafiz|bye+|goodbye|take care|phir milte|alvida|see you)/.test(lower)) return 'goodbye';
  
  // Strong compliments (before yes/ok)
  if (/(zabardast|mast|kamaal|best|love|nice|wah|wao|wow|mazedaar|perfect|great|awesome|superb|bohat acha|bohat accha)/.test(lower)) {
    return 'compliment';
  }
  if (/(acha bot|accha bot|acha hai|accha hai|bot acha|bot accha)/.test(lower)) return 'compliment';
  
  if (/^(haan|han|yes|yeah|yep|ok+|okay|theek|teek|achha|acha|jee|sahi|right|pakka|confirm)\b/.test(lower)) return 'yes_ok';
  if (/^(nahi|nahin|no|na|nah|nopes)\b/.test(lower)) return 'no';
  
  if (/(kaun ho|who are you|tum kaun|tu kaun|bot ho|kya tum bot|are you bot|kon ho|ap kaun|aap kaun)/.test(lower)) return 'who_are_you';
  if (/(insaan ho|bot ho|robot ho|machine ho|are you human|real insaan|tum insaan)/.test(lower)) return 'human_or_bot';
  
  if (/(bhook|bhuk|hungry|khana|kuch khana|pet khaali|starving)/.test(lower)) return 'hungry';
  
  // Menu / Cart
  if (/^(menu|cart|items|kya hai|kya kya|list)\b/.test(lower)) return 'menu';
  if (/^(order|new order|place order|kar do order|order karna|khana order)\b/.test(lower)) return 'order';
  if (/^(status|order kya hua|kahan hai|track|where is my order)\b/.test(lower)) return 'status';
  if (/^(cancel|cancel karo|cancel kar do)\b/.test(lower)) return 'cancel';
  
  // Deals
  if (/(deal|deals|offer|offers|combo|package|discount|kam qeemat|sasta)/.test(lower)) return 'deals';
  
  // Reservations
  if (/(reservation|booking|table|reserve|seat|book karna|table chahiye)/.test(lower)) return 'reservation';
  
  // FAQ
  if (/(hours|timing|khulta|band|kya waqt|open|close|kab khulta|kab band)\b/.test(lower)) return 'hours';
  if (/(address|location|kahan|kahan par|where)\b/.test(lower)) return 'address';
  if (/(payment|cash|card|easypaisa|jazzcash|bank|paise|paisa|pay)\b/.test(lower)) return 'payment';
  if (/(delivery|deliver|ghar par|deliver karo|home delivery)\b/.test(lower)) return 'delivery_info';
  
  if (/^(help|madad|support|kaise|kya kare|kaise kare)\b/.test(lower)) return 'help';
  
  if (/(kya acha|best|special|recommend|favorite|favourite|kya khilaoo|kya khilao|specialty|speciality|famous|popular)\b/.test(lower)) return 'recommend';
  if (/(kya hai|what is|ingredients|kya milta|recipe|kya cheez|kaise banta)\b/.test(lower)) return 'dish_info';
  if (/(qeemat|price|kitne ka|kitna|kitne|kitni|cost|rate|kya daam|kitne ki|kitni ki)\b/.test(lower)) return 'price_query';
  
  if (/^(remove|delete|hata|hatao|nikal|cancel item|remove item)\b/.test(lower)) return 'remove_item';
  if (/^(clear|clear cart|empty cart|sab hata|sab clear)\b/.test(lower)) return 'clear_cart';
  if (/^(done|finish|complete|checkout|ho gaya|bas itna|khatam)\b/.test(lower)) return 'done';
  
  // "mujhe X chahiye"
  if (/(mujhe|merko|mujh ko|mera|chahiye|chahiyeh|chahta|chahti|de do|de dein|laga do|bana do|chahiye ga)/.test(lower)) {
    return 'want_item';
  }
  
  // Feedback
  if (/(feedback|review|rating|stars|experience|kaisa laga|kaisi service)/.test(lower)) return 'feedback';
  
  return 'unknown';
}

// ==================== HELPER FUNCTIONS ====================

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

function findMenuItem(restaurantId, itemName) {
  const items = prepare('SELECT * FROM menu_items WHERE restaurant_id = ? AND is_available = 1').all(restaurantId);
  const lower = itemName.toLowerCase().trim();

  let found = items.find(i => i.name.toLowerCase() === lower);
  if (found) return found;

  found = items.find(i => i.name.toLowerCase().includes(lower) || lower.includes(i.name.toLowerCase()));
  if (found) return found;

  const words = lower.split(/\s+/).filter(w => w.length > 2);
  found = items.find(i => {
    const itemNameWords = i.name.toLowerCase().split(/\s+/);
    return words.some(w => itemNameWords.some(iw => iw.includes(w) || w.includes(iw)));
  });

  return found || null;
}

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

function updateConversation(restaurantId, phone, updates) {
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  prepare(`UPDATE bot_conversations SET ${setClauses}, last_message_at = CURRENT_TIMESTAMP WHERE restaurant_id = ? AND customer_phone = ?`)
    .run(...values, restaurantId, phone);
}

function calculateSubtotal(cart) {
  return cart.reduce((sum, item) => {
    const variations = item.variations || [];
    const variationTotal = variations.reduce((s, v) => s + (v.price_modifier || 0), 0);
    return sum + ((item.price + variationTotal) * item.qty);
  }, 0);
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getTopItems(restaurantId, limit = 4) {
  try {
    return prepare(`
      SELECT mi.id, mi.name, mi.price, mi.description,
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
    return prepare('SELECT id, name, price, description FROM menu_items WHERE restaurant_id = ? AND is_available = 1 ORDER BY name LIMIT ?').all(restaurantId, limit);
  }
}

// ==================== MESSAGE SENDING ====================

async function sendTextWithDelay(sock, jid, text, options = {}) {
  try {
    const typingMs = Math.min(Math.max(text.length * 20, 800), 3000);
    
    if (typeof sock.sendPresenceUpdate === 'function') {
      try {
        await sock.sendPresenceUpdate('composing', jid);
      } catch (e) {}
    }
    
    await new Promise(resolve => setTimeout(resolve, typingMs));
    
    if (typeof sock.sendPresenceUpdate === 'function') {
      try {
        await sock.sendPresenceUpdate('paused', jid);
      } catch (e) {}
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

async function sendText(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text });
  } catch (e) {
    console.error('[Bot] Send error:', e.message);
  }
}

// ==================== MAIN MESSAGE HANDLER ====================

async function handleMessage(sock, messageUpsert, restaurantId) {
  try {
    restaurantId = String(restaurantId);
    const messages = messageUpsert.messages;
    if (!messages || messages.length === 0) return;

    const msg = messages[0];
    if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') return;

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
    } catch (e) {}

    const customer = getOrCreateCustomer(restaurantId, phone, null);
    prepare('UPDATE customers SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(customer.id);

    let conv = getOrCreateConversation(restaurantId, phone);

    // Session timeout check
    const lastMsgTime = new Date(conv.last_message_at || Date.now()).getTime();
    const now = Date.now();
    const minutesSinceLast = (now - lastMsgTime) / 60000;
    
    if (minutesSinceLast > config.BOT.ORDER_SESSION_TIMEOUT && conv.state !== 'idle') {
      updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null });
      conv = getOrCreateConversation(restaurantId, phone);
      await sendTextWithDelay(sock, msg.key.remoteJid, responses.timeout());
    }

    const intent = detectIntent(text);
    const custCtx = getCustomerContext(restaurantId, phone);
    const restCtx = getRestaurantContext(restaurantId);

    // ==================== GLOBAL INTENTS ====================
    
    switch (intent) {
      case 'empty':
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.smallTalk.emptyMessage());
        return;
        
      case 'emoji':
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.smallTalk.emojiOnly());
        return;
        
      case 'greeting':
        await handleGreeting(sock, msg.key.remoteJid, restaurant, customer, custCtx, restCtx);
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
        if (conv.state === 'awaiting_confirmation') {
          await finalizeOrder(sock, msg.key.remoteJid, restaurantId, phone, conv);
          return;
        }
        await sendTextWithDelay(sock, msg.key.remoteJid, randomChoice(responses.smallTalk.compliment));
        return;
        
      case 'hungry':
        if (!restCtx.isOpen) {
          await sendTextWithDelay(sock, msg.key.remoteJid, 
            `Bhook lagi hai? Aray, hamara restaurant abhi band hai! 😔\n\n` +
            `Khulne ka waqt: ${restCtx.closingTime ? 'kal subah' : 'jald'}\n` +
            `Maaf kijeye ga, kal zaroor aayein! 🙏`);
          return;
        }
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.smallTalk.hungry());
        return;
        
      case 'help':
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.help());
        return;
        
      case 'hours':
        await sendHoursInfo(sock, msg.key.remoteJid, restaurant, restCtx);
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
        await sendDeliveryInfo(sock, msg.key.remoteJid, restaurantId);
        return;
        
      case 'recommend':
        if (!restCtx.isOpen) {
          await sendTextWithDelay(sock, msg.key.remoteJid, 
            `Abhi band hain bhai! 😔 Kal aayein, recommend karenge!\n\n*status* likh kar restaurant ka time dekhein.`);
          return;
        }
        const topItems = getTopItems(restaurantId, 4);
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.recommendItems(topItems));
        return;
        
      case 'deals':
        await sendActiveDeals(sock, msg.key.remoteJid, restaurantId, restCtx);
        return;
        
      case 'reservation':
        await handleReservationStart(sock, msg.key.remoteJid, restaurantId, phone, conv);
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
        await showMenu(sock, msg.key.remoteJid, restaurantId, restCtx);
        return;
        
      case 'status':
        await showLastOrderStatus(sock, msg.key.remoteJid, restaurantId, customer.id);
        return;
        
      case 'feedback':
        await sendTextWithDelay(sock, msg.key.remoteJid, 
          `Aap ka feedback hum k liye ahem hai! 🙏\n\n` +
          `Aap ke last order ki rating dijiye (1-5 stars):\n` +
          `Example: "5 stars - bohat acha khana tha!"`);
        return;
    }

    // ==================== STATE-BASED HANDLING ====================
    
    switch (conv.state) {
      case 'idle':
        if (intent === 'order') {
          if (!restCtx.isOpen) {
            await sendTextWithDelay(sock, msg.key.remoteJid, 
              `Aray, restaurant abhi band hai! 😔\n\n` +
              `Khulne ka waqt: ${restCtx.closingTime ? 'kal subah' : 'jald'}\n` +
              `Maaf kijeye ga!`);
            return;
          }
          updateConversation(restaurantId, phone, { state: 'ordering', cart_json: '[]' });
          await sendTextWithDelay(sock, msg.key.remoteJid, responses.orderStarted(customer.name));
        } else if (intent === 'status') {
          await showLastOrderStatus(sock, msg.key.remoteJid, restaurantId, customer.id);
        } else if (intent === 'yes_ok') {
          await sendTextWithDelay(sock, msg.key.remoteJid, randomChoice(responses.smallTalk.yesOk));
        } else if (intent === 'no') {
          await sendTextWithDelay(sock, msg.key.remoteJid, 'Theek hai! Kuch aur chahiye toh bataiye. 😊');
        } else if (intent === 'dish_info' || intent === 'price_query') {
          await handleDishQuery(sock, msg.key.remoteJid, restaurantId, text, intent);
        } else if (intent === 'want_item') {
          if (!restCtx.isOpen) {
            await sendTextWithDelay(sock, msg.key.remoteJid, 
              `Aray, restaurant abhi band hai! 😔 Kal zaroor aayein!`);
            return;
          }
          await handleWantItem(sock, msg.key.remoteJid, restaurantId, phone, text, conv);
        } else if (intent === 'unknown') {
          // Try to parse as item
          const { qty, name } = parseQuantityAndName(text);
          const menuItem = findMenuItem(restaurantId, name);
          if (menuItem && restCtx.isOpen) {
            updateConversation(restaurantId, phone, { state: 'ordering', cart_json: '[]' });
            await addItemToCart(sock, msg.key.remoteJid, restaurantId, phone, menuItem, qty, []);
          } else {
            await sendTextWithDelay(sock, msg.key.remoteJid, responses.smallTalk.didntUnderstand());
          }
        } else {
          if (customer.name) {
            await sendTextWithDelay(sock, msg.key.remoteJid, responses.welcomeBack(restaurant.name, customer.name, null));
          } else {
            await sendTextWithDelay(sock, msg.key.remoteJid, responses.greeting(restaurant.name));
          }
        }
        break;

      case 'ordering':
        await handleOrderingState(sock, msg.key.remoteJid, restaurantId, phone, text, conv, intent, customer, restCtx);
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
        await saveAndConfirmOrder(sock, msg.key.remoteJid, restaurantId, phone, text.trim(), conv, customer, restCtx);
        break;

      case 'awaiting_confirmation':
        if (intent === 'confirm' || intent === 'yes_ok' || intent === 'compliment') {
          await finalizeOrder(sock, msg.key.remoteJid, restaurantId, phone, conv);
        } else if (intent === 'cancel' || intent === 'no') {
          updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null });
          await sendTextWithDelay(sock, msg.key.remoteJid, responses.orderCancelled());
        } else if (intent === 'menu') {
          await showMenu(sock, msg.key.remoteJid, restaurantId, restCtx);
        } else {
          await sendTextWithDelay(sock, msg.key.remoteJid, `Bhai, *confirm* ya *cancel* likhein. 🙏\n\nKuch change karna ho toh bata dein!`);
        }
        break;

      case 'awaiting_reservation_date':
        await handleReservationDate(sock, msg.key.remoteJid, restaurantId, phone, text, conv, intent);
        break;
        
      case 'awaiting_reservation_time':
        await handleReservationTime(sock, msg.key.remoteJid, restaurantId, phone, text, conv, intent);
        break;
        
      case 'awaiting_reservation_size':
        await handleReservationSize(sock, msg.key.remoteJid, restaurantId, phone, text, conv, intent);
        break;

      default:
        updateConversation(restaurantId, phone, { state: 'idle' });
        await sendTextWithDelay(sock, msg.key.remoteJid, responses.greeting(restaurant.name));
    }
  } catch (e) {
    console.error('[Bot] handleMessage error:', e.message);
  }
}

// ==================== SPECIAL HANDLERS ====================

async function handleGreeting(sock, jid, restaurant, customer, custCtx, restCtx) {
  if (!restCtx.isOpen) {
    await sendTextWithDelay(sock, jid, 
      `Assalam o Alaikum! 🌟\n\n` +
      `${restaurant.name} mein aap ka khush aamdeed!\n\n` +
      `⚠️ Hum abhi band hain. Hamara waqt:\n` +
      `Subah 11 baje se raat 11 baje tak\n\n` +
      `Aap message kar sakte hain, jaise hi khulenge aap ka reply mil jayega! 🙏`);
    return;
  }
  
  if (customer.name && custCtx && custCtx.isReturning) {
    let lastOrderDays = null;
    if (custCtx.lastOrder) {
      lastOrderDays = Math.floor((Date.now() - new Date(custCtx.lastOrder.created_at).getTime()) / 86400000);
    }
    
    let msg = `Arre! ${customer.name} bhai, wapis khush aamdeed! 🎉\n\n`;
    
    if (custCtx.isVIP) {
      msg += `⭐ Aap hamare VIP customer hain (${custCtx.totalOrders} orders)!\n\n`;
    }
    
    if (lastOrderDays !== null) {
      if (lastOrderDays === 0) {
        msg += `Aaj hi toh order diya tha! Aur kuch chahiye? 😄\n\n`;
      } else if (lastOrderDays === 1) {
        msg += `Kal hi toh aaye the! Dobara kya khilaoo? 😊\n\n`;
      } else {
        msg += `${lastOrderDays} din pehle aaye the. Kya khilaoo aaj? 😊\n\n`;
      }
    }
    
    if (restCtx.activeDeals.length > 0) {
      msg += `🔥 Aaj k special deals available hain! *deals* likh kar dekhein!\n\n`;
    }
    
    msg += `👉 *menu* - menu dekhein\n` +
           `👉 *order* - naya order\n` +
           `👉 *status* - last order`;
    
    await sendTextWithDelay(sock, jid, msg);
  } else {
    let msg = `Assalam o Alaikum! 🌟\n\n${restaurant.name} mein aap ka khush aamdeed!\n\n`;
    if (restCtx.activeDeals.length > 0) {
      msg += `🔥 Aaj k special deals available! *deals* likh kar dekhein!\n\n`;
    }
    msg += `👉 *menu* - dekhein kya kya ban raha hai\n` +
           `👉 *order* - naya order karein\n` +
           `👉 *status* - pehle wala order kahan pohancha\n\n` +
           `Bas bata dijiye kya chahiye! 😊`;
    await sendTextWithDelay(sock, jid, msg);
  }
}

async function sendHoursInfo(sock, jid, restaurant, restCtx) {
  const allHours = prepare('SELECT * FROM operating_hours WHERE restaurant_id = ? ORDER BY day_of_week').all(restaurant.id);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  let msg = `${restaurant.name} - Khulne ka Waqt ⏰\n\n`;
  
  if (allHours.length === 0) {
    msg += `Subah 11 baje se raat 11 baje tak.\n`;
    msg += `(Monday - Sunday, har roz)\n`;
  } else {
    allHours.forEach(h => {
      if (h.is_closed) {
        msg += `${days[h.day_of_week]}: Band\n`;
      } else {
        msg += `${days[h.day_of_week]}: ${h.open_time} - ${h.close_time}\n`;
      }
    });
  }
  
  if (restCtx.isOpen) {
    msg += `\n✅ Abhi khula hai!`;
    if (restCtx.closingSoon) {
      msg += `\n⚠️ ${restCtx.closingTime} par band ho jayega. Jaldi order karein!`;
    }
  } else {
    msg += `\n❌ Abhi band hai. Khulne par aayein!`;
  }
  
  await sendTextWithDelay(sock, jid, msg);
}

async function sendDeliveryInfo(sock, jid, restaurantId) {
  const areas = prepare('SELECT * FROM delivery_areas WHERE restaurant_id = ? AND is_active = 1 ORDER BY delivery_fee').all(restaurantId);
  
  let msg = `Delivery Info 🛵\n\n`;
  
  if (areas.length === 0) {
    msg += `✅ 3-5 km: Rs. 100\n✅ 5-8 km: Rs. 150\n✅ 8-12 km: Rs. 200\n\n30-45 min lagta hai. 😊`;
  } else {
    msg += `Hamari delivery areas:\n\n`;
    areas.forEach(a => {
      msg += `📍 ${a.name}: Rs. ${a.delivery_fee}`;
      if (a.estimated_time) msg += ` (${a.estimated_time})`;
      msg += `\n`;
    });
    msg += `\nOrder k liye *order* likhein! 😊`;
  }
  
  await sendTextWithDelay(sock, jid, msg);
}

async function sendActiveDeals(sock, jid, restaurantId, restCtx) {
  if (restCtx.activeDeals.length === 0) {
    await sendTextWithDelay(sock, jid, 
      `Aaj koi active deal nahi hai. 😔\n\n` +
      `Lekin hamara menu dekhein, bohat kuch hai!\n\n*menu* likhein!`);
    return;
  }
  
  let msg = `🔥 Aaj k Special Deals 🔥\n\n`;
  
  for (const deal of restCtx.activeDeals) {
    msg += `⭐ *${deal.name}*\n`;
    if (deal.description) msg += `${deal.description}\n`;
    if (deal.original_price) {
      msg += `~~Rs. ${deal.original_price}~~ `;
    }
    msg += `*Rs. ${deal.deal_price}*\n`;
    
    // Get deal items
    const dealItems = prepare(`
      SELECT di.*, mi.name as item_name 
      FROM deal_items di 
      LEFT JOIN menu_items mi ON di.menu_item_id = mi.id 
      WHERE di.deal_id = ?
    `).all(deal.id);
    
    if (dealItems.length > 0) {
      msg += `Includes:\n`;
      dealItems.forEach(di => {
        const itemName = di.custom_name || di.item_name;
        msg += `  • ${di.quantity}x ${itemName}\n`;
      });
    }
    msg += `\n`;
  }
  
  msg += `Order k liye deal ka naam likhein! 😊`;
  await sendTextWithDelay(sock, jid, msg);
}

async function handleReservationStart(sock, jid, restaurantId, phone, conv) {
  updateConversation(restaurantId, phone, { state: 'awaiting_reservation_date' });
  await sendTextWithDelay(sock, jid, 
    `Table Reservation 🍽️\n\n` +
    `Zaroori! Reservation k liye details chahiye.\n\n` +
    `📅 Kon sa din chahiye? (Example: "kal", "Monday", "15 December")`);
}

async function handleReservationDate(sock, jid, restaurantId, phone, text, conv, intent) {
  if (intent === 'cancel') {
    updateConversation(restaurantId, phone, { state: 'idle' });
    await sendTextWithDelay(sock, jid, responses.orderCancelled());
    return;
  }
  
  // Store date in notes
  prepare('UPDATE bot_conversations SET notes = ? WHERE id = ?').run(text.trim(), conv.id);
  updateConversation(restaurantId, phone, { state: 'awaiting_reservation_time' });
  
  await sendTextWithDelay(sock, jid, 
    `⏰ Kon se time par aayeinge?\n\n` +
    `Example: "8 PM", "2000", "20:00"`);
}

async function handleReservationTime(sock, jid, restaurantId, phone, text, conv, intent) {
  if (intent === 'cancel') {
    updateConversation(restaurantId, phone, { state: 'idle' });
    await sendTextWithDelay(sock, jid, responses.orderCancelled());
    return;
  }
  
  // Append time to notes
  const newNotes = (conv.notes || '') + ' | Time: ' + text.trim();
  prepare('UPDATE bot_conversations SET notes = ? WHERE id = ?').run(newNotes, conv.id);
  updateConversation(restaurantId, phone, { state: 'awaiting_reservation_size' });
  
  await sendTextWithDelay(sock, jid, 
    `👥 Kitne log aayeinge? (Party size)\n\n` +
    `Example: "2", "4", "6 log"`);
}

async function handleReservationSize(sock, jid, restaurantId, phone, text, conv, intent) {
  if (intent === 'cancel') {
    updateConversation(restaurantId, phone, { state: 'idle' });
    await sendTextWithDelay(sock, jid, responses.orderCancelled());
    return;
  }
  
  const size = parseInt(text.replace(/[^0-9]/g, '')) || 2;
  
  // Create reservation
  const reservationId = _generateId('res_');
  const notes = conv.notes || '';
  const dateMatch = notes.match(/^([^|]+)/);
  const timeMatch = notes.match(/Time:\s*(.+)$/);
  
  const resDate = dateMatch ? dateMatch[1].trim() : 'Today';
  const resTime = timeMatch ? timeMatch[1].trim() : text;
  
  const customer = prepare('SELECT * FROM customers WHERE restaurant_id = ? AND phone = ?').get(restaurantId, phone);
  
  prepare(`INSERT INTO reservations 
    (id, restaurant_id, customer_phone, customer_name, party_size, reservation_date, reservation_time, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`).run(
    reservationId, restaurantId, phone, customer?.name || '', size, resDate, resTime
  );
  
  // Notify restaurant dashboard
  try {
    if (global.socketIO) {
      global.socketIO.emit(`restaurant:new_reservation:${restaurantId}`, {
        reservationId, phone, customerName: customer?.name, size, date: resDate, time: resTime
      });
    }
  } catch (e) {}
  
  updateConversation(restaurantId, phone, { state: 'idle', notes: null });
  
  await sendTextWithDelay(sock, jid, 
    `✅ Reservation Request ho gayi! 🎉\n\n` +
    `Reservation ID: *${reservationId}*\n` +
    `📅 Date: ${resDate}\n` +
    `⏰ Time: ${resTime}\n` +
    `👥 Party Size: ${size} log\n\n` +
    `Restaurant confirm karega aur aap ko message bhej dega.\n\n` +
    `Shukriya! 😊`);
}

async function handleDishQuery(sock, jid, restaurantId, text, intent) {
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
      // Include variations info
      const variations = getItemVariations(menuItem.id);
      let msg = responses.smallTalk.dishInfo(menuItem);
      if (variations.length > 0) {
        msg += `\n*Variations available:*\n`;
        variations.forEach(v => {
          const mod = v.price_modifier > 0 ? ` (+Rs. ${v.price_modifier})` : v.price_modifier < 0 ? ` (-Rs. ${Math.abs(v.price_modifier)})` : '';
          msg += `• ${v.name}${mod}\n`;
        });
      }
      await sendTextWithDelay(sock, jid, msg);
    }
  } else {
    await sendTextWithDelay(sock, jid, `Yeh item menu mein nahi mila. 😅\n\n*menu* likh kar menu dekhein!`);
  }
}

async function handleWantItem(sock, jid, restaurantId, phone, text, conv) {
  let itemName = text.toLowerCase()
    .replace(/mujhe|merko|mujh ko|mera|chahiye|chahiyeh|chahta|chahti|de do|de dein|laga do|bana do|chahiye ga|ek|do|char|aik|tho/g, '')
    .replace(/\d+\s*x?\s*/g, '')
    .replace(/[?؟!.,]/g, '')
    .trim();
  
  const menuItem = findMenuItem(restaurantId, itemName);
  if (!menuItem) {
    await sendTextWithDelay(sock, jid, `Aray, "${itemName}" humare menu mein nahi mila. 😅\n\n*menu* likh kar menu dekhein!`);
    return;
  }
  
  let qty = 1;
  const qtyMatch = text.match(/(\d+)\s*x?\s*(?:plate|portion|piece|burger|pizza)/i) || text.match(/(\d+)/);
  if (qtyMatch) {
    qty = Math.min(parseInt(qtyMatch[1]), 20);
  }
  
  if (conv.state !== 'ordering') {
    updateConversation(restaurantId, phone, { state: 'ordering', cart_json: '[]' });
  }
  
  const cart = JSON.parse(conv.cart_json || '[]');
  await addItemToCart(sock, jid, restaurantId, phone, menuItem, qty, cart);
}

async function handleOrderingState(sock, jid, restaurantId, phone, text, conv, intent, customer, restCtx) {
  const lowerText = text.toLowerCase().trim();

  if (intent === 'done') {
    const cart = JSON.parse(conv.cart_json || '[]');
    if (cart.length === 0) {
      await sendTextWithDelay(sock, jid, responses.cartEmpty());
      return;
    }
    
    // Check minimum order
    const subtotal = calculateSubtotal(cart);
    const restaurant = prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
    if (restaurant.min_order_amount && subtotal < restaurant.min_order_amount) {
      await sendTextWithDelay(sock, jid, 
        `⚠️ Minimum order Rs. ${restaurant.min_order_amount} hai.\n` +
        `Aap ka cart: Rs. ${subtotal}\n\n` +
        `Aur items add karein ya *cancel* likhein.`);
      return;
    }
    
    updateConversation(restaurantId, phone, { state: 'awaiting_order_type' });
    await sendTextWithDelay(sock, jid, responses.askOrderType());
    return;
  }

  if (lowerText === 'cart') {
    await showCart(sock, jid, restaurantId, phone);
    return;
  }

  if (intent === 'remove_item') {
    await handleRemoveItem(sock, jid, restaurantId, phone, text, conv);
    return;
  }

  if (intent === 'clear_cart') {
    updateConversation(restaurantId, phone, { cart_json: '[]' });
    await sendTextWithDelay(sock, jid, responses.cartCleared());
    return;
  }

  if (intent === 'menu') {
    await showMenu(sock, jid, restaurantId, restCtx);
    return;
  }

  if (intent === 'cancel') {
    updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null });
    await sendTextWithDelay(sock, jid, responses.orderCancelled());
    return;
  }

  if (intent === 'status') {
    await showLastOrderStatus(sock, jid, restaurantId, customer.id);
    return;
  }

  if (intent === 'recommend') {
    const topItems = getTopItems(restaurantId, 4);
    await sendTextWithDelay(sock, jid, responses.recommendItems(topItems));
    return;
  }
  
  if (intent === 'deals') {
    await sendActiveDeals(sock, jid, restaurantId, restCtx);
    return;
  }

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

async function addItemToCart(sock, jid, restaurantId, phone, menuItem, qty, cart) {
  const existing = cart.find(c => c.item_id === menuItem.id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      item_id: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      qty: qty,
      variations: []
    });
  }
  
  const updatedCart = JSON.stringify(cart);
  updateConversation(restaurantId, phone, { cart_json: updatedCart });
  
  const cartCount = cart.length;
  const subtotal = calculateSubtotal(cart);
  const lastAdded = cart.find(c => c.item_id === menuItem.id);
  await sendTextWithDelay(sock, jid, responses.itemAdded(lastAdded, cartCount, subtotal));
}

async function handleRemoveItem(sock, jid, restaurantId, phone, text, conv) {
  const cart = JSON.parse(conv.cart_json || '[]');
  if (cart.length === 0) {
    await sendTextWithDelay(sock, jid, responses.cartEmpty());
    return;
  }

  let itemName = text.toLowerCase().replace(/^(remove|delete|hata|hatao|nikal|cancel item|remove item)\s*/i, '').trim();
  
  if (!itemName) {
    let msg = `Kaun sa item remove karoon? 🤔\n\n`;
    cart.forEach((item, i) => {
      msg += `${i + 1}. ${item.qty}x ${item.name}\n`;
    });
    msg += `\nItem ka naam ya number likhein!`;
    await sendTextWithDelay(sock, jid, msg);
    return;
  }

  const num = parseInt(itemName);
  if (!isNaN(num) && num >= 1 && num <= cart.length) {
    const removed = cart.splice(num - 1, 1)[0];
    updateConversation(restaurantId, phone, { cart_json: JSON.stringify(cart) });
    await sendTextWithDelay(sock, jid, responses.itemRemoved(removed.name, cart));
    return;
  }

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

async function saveAndConfirmOrder(sock, jid, restaurantId, phone, phoneInput, conv, customer, restCtx) {
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
  const restaurant = prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
  
  // Calculate delivery fee based on restaurant setting
  const deliveryFee = conv.order_type === 'delivery' ? (restaurant.delivery_fee_default || 100) : 0;
  
  // Calculate tax
  const taxAmount = restaurant.tax_percentage ? (subtotal * restaurant.tax_percentage / 100) : 0;
  const total = subtotal + deliveryFee + taxAmount;

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
    tax: taxAmount,
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
  } catch (e) {}

  updateConversation(restaurantId, phone, { 
    state: 'idle', 
    cart_json: '[]', 
    order_type: null,
    notes: null
  });
}

async function showMenu(sock, jid, restaurantId, restCtx) {
  const restaurant = prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
  const categories = prepare('SELECT * FROM menu_categories WHERE restaurant_id = ? AND is_active = 1 ORDER BY sort_order').all(restaurantId);
  
  let message = responses.menuHeader(restaurant.name);
  
  // Show active deals first
  if (restCtx && restCtx.activeDeals && restCtx.activeDeals.length > 0) {
    message += `\n🔥 *SPECIAL DEALS* 🔥\n`;
    restCtx.activeDeals.forEach(deal => {
      message += `• ${deal.name} - Rs. ${deal.deal_price}`;
      if (deal.original_price) {
        message += ` (~~${deal.original_price}~~)`;
      }
      message += `\n`;
    });
    message += `\n*deals* likh kar details dekhein!\n\n`;
  }

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
          // Show variations if available
          const variations = getItemVariations(item.id);
          const sizes = variations.filter(v => v.type === 'size');
          if (sizes.length > 0) {
            message += `  Sizes: ${sizes.map(s => `${s.name} ${s.price_modifier > 0 ? '+' + s.price_modifier : ''}`).join(', ')}\n`;
          }
        });
      }
    });
  }

  message += responses.menuFooter();
  await sendTextWithDelay(sock, jid, message);
}

async function showLastOrderStatus(sock, jid, restaurantId, customerId) {
  const order = prepare('SELECT * FROM orders WHERE restaurant_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 1').get(restaurantId, customerId);
  if (!order) {
    await sendTextWithDelay(sock, jid, responses.noOrders());
    return;
  }
  await sendTextWithDelay(sock, jid, responses.lastOrderStatus(order));
}

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
