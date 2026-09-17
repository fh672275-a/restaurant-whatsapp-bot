/**
 * AI-First Bot Message Handler (Fully Autonomous)
 * 
 * NO rigid state machine! AI decides what to do:
 * 1. AI parses message and extracts: items, delivery type, name, phone, address
 * 2. If customer wants to order + provides all info → save order directly
 * 3. If customer provides partial info → ask for missing
 * 4. AI handles all chat naturally
 */

const aiAgent = require('./ai-agent');

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

const conversationHistory = new Map();

function getHistoryKey(restaurantId, phone) {
  return `${restaurantId}:${phone}`;
}

function getConversationHistory(restaurantId, phone) {
  const key = getHistoryKey(restaurantId, phone);
  if (!conversationHistory.has(key)) {
    conversationHistory.set(key, []);
  }
  return conversationHistory.get(key);
}

function addToHistory(restaurantId, phone, role, content) {
  const history = getConversationHistory(restaurantId, phone);
  history.push({ role, content });
  if (history.length > 20) {
    history.shift();
  }
}

// ==================== HELPERS ====================

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
  return cart.reduce((sum, item) => sum + (item.qty * item.price), 0);
}

function getRestaurantContext(restaurantId) {
  const restaurant = prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
  
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  
  const operatingHours = prepare('SELECT * FROM operating_hours WHERE restaurant_id = ? AND day_of_week = ?').get(restaurantId, dayOfWeek);
  
  let isOpen = true;
  let closingTime = null;
  if (operatingHours) {
    if (operatingHours.is_closed) {
      isOpen = false;
    } else if (operatingHours.open_time && operatingHours.close_time) {
      isOpen = currentTime >= operatingHours.open_time && currentTime <= operatingHours.close_time;
      closingTime = operatingHours.close_time;
    }
  }
  
  const menuItems = prepare(`
    SELECT mi.*, mc.name as category_name 
    FROM menu_items mi 
    LEFT JOIN menu_categories mc ON mi.category_id = mc.id 
    WHERE mi.restaurant_id = ? AND mi.is_available = 1 
    ORDER BY mc.sort_order, mi.sort_order, mi.name
  `).all(restaurantId);
  
  const deals = prepare(`
    SELECT * FROM deals WHERE restaurant_id = ? AND is_active = 1 
    AND (valid_from IS NULL OR valid_from <= datetime('now'))
    AND (valid_until IS NULL OR valid_until >= datetime('now'))
    ORDER BY sort_order
  `).all(restaurantId);
  
  const allHours = prepare('SELECT * FROM operating_hours WHERE restaurant_id = ? ORDER BY day_of_week').all(restaurantId);
  const deliveryAreas = prepare('SELECT * FROM delivery_areas WHERE restaurant_id = ? AND is_active = 1').all(restaurantId);
  
  return { restaurant, isOpen, closingTime, menuItems, deals, operatingHours: allHours, deliveryAreas };
}

function getCustomerContext(restaurantId, customer) {
  if (!customer) return {};
  
  const recentOrders = prepare(`
    SELECT * FROM orders WHERE restaurant_id = ? AND customer_id = ? 
    ORDER BY created_at DESC LIMIT 5
  `).all(restaurantId, customer.id);
  
  return {
    recentOrders,
    isVIP: recentOrders.length >= 10,
    isReturning: recentOrders.length > 0
  };
}

async function sendTextWithDelay(sock, jid, text) {
  try {
    // INSTANT reply - no typing delay
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

// ==================== ORDER SAVING ====================

async function saveOrder(restaurantId, customer, cart, orderType, phone, address) {
  if (!cart || cart.length === 0) {
    console.log('[Bot] Cannot save order - cart empty');
    return null;
  }
  
  let cleanPhone = phone || customer.phone || '';
  if (cleanPhone.startsWith('92')) {
    cleanPhone = '0' + cleanPhone.substring(2);
  }
  if (cleanPhone && !cleanPhone.startsWith('0')) {
    cleanPhone = '0' + cleanPhone;
  }
  
  if (!cleanPhone || cleanPhone.length < 10) {
    console.log('[Bot] Cannot save order - invalid phone:', cleanPhone);
    return null;
  }
  
  const subtotal = calculateSubtotal(cart);
  const restaurant = prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
  const deliveryFee = orderType === 'delivery' ? (restaurant.delivery_fee_default || 100) : 0;
  const taxAmount = restaurant.tax_percentage ? (subtotal * restaurant.tax_percentage / 100) : 0;
  const total = subtotal + deliveryFee + taxAmount;
  
  const orderId = _generateId('ord_');
  
  console.log('[Bot] === SAVING ORDER ===');
  console.log('[Bot] Order ID:', orderId);
  console.log('[Bot] Customer:', customer.name, '|', cleanPhone);
  console.log('[Bot] Address:', address);
  console.log('[Bot] Type:', orderType);
  console.log('[Bot] Items:', cart.length, '| Subtotal:', subtotal, '| Delivery:', deliveryFee, '| Total:', total);
  
  prepare(`INSERT INTO orders 
    (id, restaurant_id, customer_id, customer_phone, customer_name, customer_address, order_type, items_json, subtotal, delivery_fee, total, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`).run(
    orderId, restaurantId, customer.id, cleanPhone, customer.name, address,
    orderType, JSON.stringify(cart), subtotal, deliveryFee, total
  );
  
  prepare('INSERT INTO order_status_history (order_id, status) VALUES (?, ?)').run(orderId, 'new');
  prepare('UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + ? WHERE id = ?')
    .run(total, customer.id);
  
  console.log('[Bot] ✅ Order saved:', orderId);
  
  // Notify dashboard
  try {
    if (global.socketIO) {
      global.socketIO.emit(`restaurant:new_order:${restaurantId}`, {
        orderId,
        total,
        customer_name: customer.name,
        customer_phone: cleanPhone,
        items: cart
      });
      console.log('[Bot] ✅ Dashboard notified');
    }
  } catch (e) {
    console.error('[Bot] Socket emit error:', e.message);
  }
  
  return { orderId, total, items: cart, subtotal, deliveryFee, taxAmount };
}

// ==================== MAIN HANDLER (AI-FIRST) ====================

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
    let phone = String(msg.key.remoteJid || '').split('@')[0];
    
    if (!phone || !text) return;

    console.log(`[Bot] ========== NEW MESSAGE ==========`);
    console.log(`[Bot] From: ${phone}`);
    console.log(`[Bot] Message: "${text}"`);

    const restaurant = prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
    if (!restaurant || !restaurant.is_active) return;

    try {
      await sock.readMessages([msg.key]);
    } catch (e) {}

    const customer = getOrCreateCustomer(restaurantId, phone, null);
    prepare('UPDATE customers SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(customer.id);

    let conv = getOrCreateConversation(restaurantId, phone);
    
    // Get contexts
    const restCtx = getRestaurantContext(restaurantId);
    const custCtx = getCustomerContext(restaurantId, customer);
    let cart = JSON.parse(conv.cart_json || '[]');
    const history = getConversationHistory(restaurantId, phone);

    const aiContext = {
      menuItems: restCtx.menuItems,
      deals: restCtx.deals,
      operatingHours: restCtx.operatingHours,
      deliveryAreas: restCtx.deliveryAreas,
      isOpen: restCtx.isOpen,
      closingTime: restCtx.closingTime,
      recentOrders: custCtx.recentOrders,
      isVIP: custCtx.isVIP,
      isReturning: custCtx.isReturning,
      cart: cart,
      conversationHistory: history
    };

    // ===== AI PARSES THE MESSAGE =====
    console.log('[Bot] Parsing message with AI...');
    const parsed = await aiAgent.parseCustomerMessage(text, restCtx.menuItems, cart);
    console.log('[Bot] Parsed:', JSON.stringify(parsed, null, 2));

    let aiResponse = '';
    let orderSaved = false;

    // ===== HANDLE BASED ON AI DECISION =====

    // 1. CANCEL
    if (parsed.wants_to_cancel || parsed.action === 'cancel') {
      updateConversation(restaurantId, phone, { 
        state: 'idle', cart_json: '[]', order_type: null, notes: null 
      });
      aiResponse = 'Theek hai, order cancel kar diya. 🙏\nKuch aur chahiye toh bataiye!';
    }

    // 2. CORRECTION - "nahi, sirf burger tha"
    else if (parsed.action === 'correct') {
      // Keep only items customer explicitly wants
      const newCart = [];
      if (parsed.items && parsed.items.length > 0) {
        parsed.items.forEach(item => {
          const existing = cart.find(c => c.item_id === item.item_id);
          if (existing) {
            newCart.push(existing); // Keep existing item with its qty
          } else {
            newCart.push(item);
          }
        });
      }
      
      updateConversation(restaurantId, phone, { 
        state: 'ordering', 
        cart_json: JSON.stringify(newCart) 
      });
      aiContext.cart = newCart;
      
      let cartMsg = '';
      let subtotal = 0;
      newCart.forEach((item, i) => {
        cartMsg += `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n`;
        subtotal += item.qty * item.price;
      });
      
      aiResponse = `Maaf kijiye! Order correct kar raha hoon. 😊\n\nAap ka order:\n${cartMsg}\nTotal: Rs. ${subtotal}\n\nAur kuch chahiye?`;
    }

    // 3. REMOVE ITEM - "fries hata do"
    else if (parsed.action === 'remove' && parsed.remove_items) {
      const newCart = cart.filter(c => !parsed.remove_items.includes(c.name));
      updateConversation(restaurantId, phone, { 
        state: 'ordering', 
        cart_json: JSON.stringify(newCart) 
      });
      aiContext.cart = newCart;
      
      let cartMsg = '';
      let subtotal = 0;
      newCart.forEach((item, i) => {
        cartMsg += `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n`;
        subtotal += item.qty * item.price;
      });
      
      if (newCart.length > 0) {
        aiResponse = `Theek hai, remove kar diya. 🗑️\n\nBaqi order:\n${cartMsg}\nTotal: Rs. ${subtotal}`;
      } else {
        aiResponse = `Theek hai, remove kar diya. Cart khaali ho gaya. 🗑️`;
      }
    }

    // 4. UPDATE QUANTITY - "burger 2 kar do"
    else if (parsed.action === 'update_qty' && parsed.update_qty) {
      const { item_name, new_qty } = parsed.update_qty;
      const cartItem = cart.find(c => c.name.toLowerCase().includes(item_name.toLowerCase()));
      if (cartItem) {
        cartItem.qty = Math.min(Math.max(new_qty, 1), 5);
        updateConversation(restaurantId, phone, { 
          state: 'ordering', 
          cart_json: JSON.stringify(cart) 
        });
        aiContext.cart = cart;
        
        let cartMsg = '';
        let subtotal = 0;
        cart.forEach((item, i) => {
          cartMsg += `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n`;
          subtotal += item.qty * item.price;
        });
        
        aiResponse = `✅ Quantity update ho gaya!\n\nAap ka order:\n${cartMsg}\nTotal: Rs. ${subtotal}`;
      } else {
        aiResponse = `Yeh item aap ke cart mein nahi hai. 😊`;
      }
    }

    // 5. ADD ITEMS TO CART (STRICT - only what customer explicitly asked)
    else if (parsed.action === 'add_items' && parsed.items && parsed.items.length > 0) {
      // Add ONLY items customer explicitly requested
      parsed.items.forEach(item => {
        const existing = cart.find(c => c.item_id === item.item_id);
        if (existing) {
          existing.qty += item.qty;
          // HARD LIMIT: Max 5
          if (existing.qty > 5) existing.qty = 5;
        } else {
          cart.push(item);
        }
      });
      
      updateConversation(restaurantId, phone, { 
        state: 'ordering', 
        cart_json: JSON.stringify(cart) 
      });
      aiContext.cart = cart;
      
      if (parsed.customer_name) {
        prepare('UPDATE customers SET name = ? WHERE id = ?').run(parsed.customer_name, customer.id);
        customer.name = parsed.customer_name;
      }
      if (parsed.customer_address) {
        prepare('UPDATE bot_conversations SET notes = ? WHERE id = ?').run(parsed.customer_address, conv.id);
      }
      
      if (parsed.order_type && parsed.customer_phone) {
        console.log('[Bot] Customer provided all info! Saving order...');
        const orderResult = await saveOrder(
          restaurantId, customer, cart, parsed.order_type, 
          parsed.customer_phone, parsed.customer_address
        );
        if (orderResult) {
          orderSaved = true;
          updateConversation(restaurantId, phone, { 
            state: 'idle', cart_json: '[]', order_type: null, notes: null 
          });
        }
      }
      
      aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
    }

    // 6. CHECKOUT (customer says done/bas/ho gaya)
    else if (parsed.action === 'checkout' || parsed.wants_to_checkout) {
      if (cart.length === 0) {
        aiResponse = 'Aap ka cart khaali hai! Pehle kuch add karein. 😊';
      } else {
        // Show order summary before confirmation
        let cartMsg = 'Aap ka Order:\n\n';
        let subtotal = 0;
        cart.forEach((item, i) => {
          cartMsg += `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n`;
          subtotal += item.qty * item.price;
        });
        cartMsg += `\n*Total: Rs. ${subtotal}*\n\nDelivery (1) ya Pickup (2)?`;
        
        updateConversation(restaurantId, phone, { state: 'awaiting_order_type' });
        aiResponse = cartMsg;
      }
    }

    // 7. CONFIRM (customer confirms after seeing summary)
    else if (parsed.action === 'confirm' || parsed.wants_to_confirm) {
      // Check if there's a pending order
      if (conv.state === 'awaiting_confirmation') {
        const tempData = JSON.parse(conv.cart_json || '{}');
        if (tempData.orderId) {
          const order = prepare('SELECT * FROM orders WHERE id = ?').get(tempData.orderId);
          if (order && order.status === 'new') {
            prepare("UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
            prepare('INSERT INTO order_status_history (order_id, status) VALUES (?, ?)').run(order.id, 'confirmed');
            
            updateConversation(restaurantId, phone, { 
              state: 'idle', cart_json: '[]', order_type: null, notes: null 
            });
            
            aiContext.conversationState = 'confirmed';
            aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
          }
        }
      } else {
        // No pending order, treat as chat
        aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
      }
    }

    // 5. CUSTOMER PROVIDING INFO (name/phone/address)
    else if (parsed.action === 'ask_info') {
      // Update customer info
      if (parsed.customer_name) {
        prepare('UPDATE customers SET name = ? WHERE id = ?').run(parsed.customer_name, customer.id);
        customer.name = parsed.customer_name;
      }
      if (parsed.customer_address) {
        prepare('UPDATE bot_conversations SET notes = ? WHERE id = ?').run(parsed.customer_address, conv.id);
      }
      
      // If we have cart + all info, save order
      if (cart.length > 0 && parsed.order_type && parsed.customer_phone) {
        console.log('[Bot] Info provided with cart! Saving order...');
        const orderResult = await saveOrder(
          restaurantId, customer, cart, parsed.order_type, parsed.customer_phone, 
          parsed.customer_address || conv.notes
        );
        if (orderResult) {
          orderSaved = true;
          updateConversation(restaurantId, phone, { 
            state: 'idle', cart_json: '[]', order_type: null, notes: null 
          });
        }
      }
      
      aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
    }

    // 6. GENERAL CHAT
    else {
      aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
    }

    // ===== SEND RESPONSE =====
    if (aiResponse) {
      console.log('[Bot] Response:', aiResponse.substring(0, 100));
      await sendTextWithDelay(sock, msg.key.remoteJid, aiResponse);
      
      addToHistory(restaurantId, phone, 'user', text);
      addToHistory(restaurantId, phone, 'assistant', aiResponse);
    }
    
    console.log('[Bot] ========== DONE ==========\n');
  } catch (e) {
    console.error('[Bot] handleMessage error:', e.message);
    console.error(e.stack);
  }
}

// ==================== ORDER STATUS NOTIFICATIONS ====================

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
        message = `✅ Bhai, aap ka order *${order.id}* confirm ho gaya!\n\nKitchen mein bhej diya, ban raha hai. 👨‍🍳`;
        break;
      case 'preparing':
        message = `👨‍🍳 Aap ka order *${order.id}* ban raha hai!\n\nTaza taza khana ban raha hai. Kuch hi der mein ready! 😋`;
        break;
      case 'ready':
        if (order.order_type === 'pickup') {
          message = `🔔 Aap ka order *${order.id}* ready hai!\n\nRestaurant se le ja sakte hain. 🙏`;
        } else {
          message = `🛵 Bhai, aap ka order *${order.id}* ready hai!\n\nDelivery boy nikal raha hai. Thodi der mein aap ke paas hoga! 😊`;
        }
        break;
      case 'delivered':
        message = `✅ Aap ka order *${order.id}* deliver ho gaya!\n\nKhana kaisa laga? Feedback zaroor dein! 🙏\n\nDobara order k liye "menu" likhein! 😊`;
        break;
      case 'cancelled':
        message = `❌ Bhai, order *${order.id}* cancel karna para.\n${reason ? `Waja: ${reason}\n` : ''}Maaf kijeye ga. 🙏\n\nDobara try karein!`;
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
  sendText: sendTextWithDelay,
  sendTextWithDelay
};
