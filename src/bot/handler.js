/**
 * Bot Message Handler
 * 
 * Processes incoming WhatsApp messages from customers.
 * Manages conversation state machine using Roman English.
 */

const responses = require('./responses');
const config = require('../config');

// Lazy-loaded modules to avoid circular dependencies
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

// Cached prepared statements (avoid creating new ones in hot loops)
const stmtCache = new Map();
function prepare(sql) {
  const db = getDB();
  if (!stmtCache.has(sql)) {
    stmtCache.set(sql, db.prepare(sql));
  }
  return stmtCache.get(sql);
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
  const stmt = prepare('SELECT * FROM menu_items WHERE restaurant_id = ? AND is_available = 1');
  const items = stmt.all(restaurantId);
  const lower = itemName.toLowerCase().trim();

  let found = items.find(i => i.name.toLowerCase() === lower);
  if (found) return found;

  found = items.find(i => i.name.toLowerCase().includes(lower) || lower.includes(i.name.toLowerCase()));
  if (found) return found;

  const words = lower.split(/\s+/);
  found = items.find(i => {
    const itemNameWords = i.name.toLowerCase().split(/\s+/);
    return words.some(w => itemNameWords.some(iw => iw.includes(w) && w.length > 2));
  });

  return found || null;
}

/**
 * Get or create customer
 */
function getOrCreateCustomer(restaurantId, phone, name) {
  const db = getDB();
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
  const db = getDB();
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
                       '';

    const text = (conversation || '').trim();
    if (!text) return;

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
      await sendText(sock, msg.key.remoteJid, responses.timeout());
    }

    const lowerText = text.toLowerCase();

    // Global commands
    if (lowerText === 'cancel') {
      updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null });
      await sendText(sock, msg.key.remoteJid, responses.orderCancelled());
      return;
    }

    if (lowerText === 'help' || lowerText === 'madad') {
      await sendText(sock, msg.key.remoteJid, responses.help());
      return;
    }

    if (lowerText === 'menu' || lowerText === 'cart') {
      if (conv.state === 'ordering' && lowerText === 'cart') {
        await showCart(sock, msg.key.remoteJid, restaurantId, phone);
        return;
      }
      await showMenu(sock, msg.key.remoteJid, restaurantId);
      return;
    }

    if (lowerText === 'status') {
      await showLastOrderStatus(sock, msg.key.remoteJid, restaurantId, customer.id);
      return;
    }

    if (lowerText === 'hours' || lowerText === 'timing') {
      await sendText(sock, msg.key.remoteJid, responses.hours(restaurant.name));
      return;
    }

    if (lowerText === 'contact' || lowerText === 'info') {
      await sendText(sock, msg.key.remoteJid, responses.contact(restaurant.name, restaurant.phone, restaurant.address));
      return;
    }

    if (['start', 'hi', 'hello', 'assalam', 'salam', 'assalamualaikum'].some(w => lowerText === w || lowerText.startsWith(w + ' '))) {
      if (customer.name) {
        await sendText(sock, msg.key.remoteJid, responses.welcomeBack(restaurant.name, customer.name));
      } else {
        await sendText(sock, msg.key.remoteJid, responses.greeting(restaurant.name));
      }
      return;
    }

    // State machine
    switch (conv.state) {
      case 'idle':
        if (lowerText === 'order' || lowerText === 'new order') {
          updateConversation(restaurantId, phone, { state: 'ordering', cart_json: '[]' });
          await sendText(sock, msg.key.remoteJid, responses.orderStarted());
        } else {
          if (customer.name) {
            await sendText(sock, msg.key.remoteJid, responses.welcomeBack(restaurant.name, customer.name));
          } else {
            await sendText(sock, msg.key.remoteJid, responses.greeting(restaurant.name));
          }
        }
        break;

      case 'ordering':
        await handleOrderingState(sock, msg.key.remoteJid, restaurantId, phone, text, conv);
        break;

      case 'awaiting_order_type':
        await handleOrderTypeChoice(sock, msg.key.remoteJid, restaurantId, phone, text, conv);
        break;

      case 'awaiting_name':
        updateConversation(restaurantId, phone, { state: 'awaiting_address' });
        prepare('UPDATE customers SET name = ? WHERE id = ?').run(text.trim(), customer.id);
        if (conv.order_type === 'delivery') {
          await sendText(sock, msg.key.remoteJid, responses.askAddress());
        } else {
          await sendText(sock, msg.key.remoteJid, `Phone number bhejein delivery confirmation k liye:\nExample: 03001234567`);
        }
        break;

      case 'awaiting_address':
        if (conv.order_type === 'delivery') {
          updateConversation(restaurantId, phone, { state: 'awaiting_phone' });
          prepare('UPDATE bot_conversations SET notes = ? WHERE id = ?').run(text.trim(), conv.id);
          await sendText(sock, msg.key.remoteJid, responses.askPhone());
        } else {
          await sendText(sock, msg.key.remoteJid, responses.askPhone());
        }
        break;

      case 'awaiting_phone':
        await saveAndConfirmOrder(sock, msg.key.remoteJid, restaurantId, phone, text.trim(), conv, customer);
        break;

      case 'awaiting_confirmation':
        if (['confirm', 'yes', 'ok', 'haan', 'confirm karein'].some(w => lowerText === w)) {
          await finalizeOrder(sock, msg.key.remoteJid, restaurantId, phone, conv);
        } else if (['cancel', 'no', 'nahi'].some(w => lowerText === w)) {
          updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null });
          await sendText(sock, msg.key.remoteJid, responses.orderCancelled());
        } else {
          await sendText(sock, msg.key.remoteJid, `⚠️ "confirm" ya "cancel" likhein.`);
        }
        break;

      default:
        updateConversation(restaurantId, phone, { state: 'idle' });
        await sendText(sock, msg.key.remoteJid, responses.greeting(restaurant.name));
    }
  } catch (e) {
    console.error('[Bot] handleMessage error:', e.message);
  }
}

/**
 * Handle ordering state
 */
async function handleOrderingState(sock, jid, restaurantId, phone, text, conv) {
  const lowerText = text.toLowerCase();

  if (['done', 'finish', 'complete', 'checkout'].includes(lowerText)) {
    const cart = JSON.parse(conv.cart_json || '[]');
    if (cart.length === 0) {
      await sendText(sock, jid, responses.cartEmpty());
      return;
    }
    updateConversation(restaurantId, phone, { state: 'awaiting_order_type' });
    await sendText(sock, jid, responses.askOrderType());
    return;
  }

  const { qty, name } = parseQuantityAndName(text);
  if (qty < 1 || qty > 20) {
    await sendText(sock, jid, `⚠️ Quantity 1 se 20 tak ho sakti hai.`);
    return;
  }

  const menuItem = findMenuItem(restaurantId, name);
  if (!menuItem) {
    await sendText(sock, jid, responses.itemNotFound(name));
    return;
  }

  const cart = JSON.parse(conv.cart_json || '[]');
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
  
  updateConversation(restaurantId, phone, { cart_json: JSON.stringify(cart) });
  
  const lastAdded = cart.find(c => c.item_id === menuItem.id);
  await sendText(sock, jid, responses.itemAdded(lastAdded));
}

/**
 * Show cart
 */
async function showCart(sock, jid, restaurantId, phone) {
  const conv = getOrCreateConversation(restaurantId, phone);
  const cart = JSON.parse(conv.cart_json || '[]');
  if (cart.length === 0) {
    await sendText(sock, jid, responses.cartEmpty());
    return;
  }
  const subtotal = calculateSubtotal(cart);
  await sendText(sock, jid, responses.cartSummary(cart, subtotal));
}

/**
 * Handle order type choice
 */
async function handleOrderTypeChoice(sock, jid, restaurantId, phone, text, conv) {
  const lowerText = text.toLowerCase();
  let orderType = null;

  if (lowerText === '1' || lowerText === 'delivery' || lowerText.includes('deliver')) {
    orderType = 'delivery';
  } else if (lowerText === '2' || lowerText === 'pickup' || lowerText.includes('pick')) {
    orderType = 'pickup';
  } else {
    await sendText(sock, jid, `⚠️ "1" (delivery) ya "2" (pickup) likhein.`);
    return;
  }

  updateConversation(restaurantId, phone, { state: 'awaiting_name', order_type: orderType });
  await sendText(sock, jid, responses.askName());
}

/**
 * Save and confirm order
 */
async function saveAndConfirmOrder(sock, jid, restaurantId, phone, phoneInput, conv, customer) {
  const cart = JSON.parse(conv.cart_json || '[]');
  if (cart.length === 0) {
    await sendText(sock, jid, responses.cartEmpty());
    return;
  }

  const restaurant = prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
  
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

  await sendText(sock, jid, responses.orderConfirmation(orderData));
}

/**
 * Finalize order after customer confirms
 */
async function finalizeOrder(sock, jid, restaurantId, phone, conv) {
  const tempData = JSON.parse(conv.cart_json || '{}');
  if (!tempData.orderId) {
    await sendText(sock, jid, responses.somethingWrong());
    return;
  }

  const order = prepare('SELECT * FROM orders WHERE id = ?').get(tempData.orderId);
  if (!order) {
    await sendText(sock, jid, responses.somethingWrong());
    return;
  }

  prepare("UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
  prepare('INSERT INTO order_status_history (order_id, status) VALUES (?, ?)').run(order.id, 'confirmed');

  await sendText(sock, jid, responses.orderConfirmed(order.id, order.total));

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
  await sendText(sock, jid, message);
}

/**
 * Show last order status
 */
async function showLastOrderStatus(sock, jid, restaurantId, customerId) {
  const order = prepare('SELECT * FROM orders WHERE restaurant_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 1').get(restaurantId, customerId);
  if (!order) {
    await sendText(sock, jid, responses.noOrders());
    return;
  }
  await sendText(sock, jid, responses.lastOrderStatus(order));
}

/**
 * Send text message
 */
async function sendText(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text });
  } catch (e) {
    console.error('[Bot] Send error:', e.message);
  }
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
      await wa.sendMessage(restaurantId, jid, message);
    }
  } catch (e) {
    console.error('[Bot] Status notify error:', e.message);
  }
}

module.exports = {
  handleMessage,
  notifyOrderStatus,
  showMenu,
  sendText
};
