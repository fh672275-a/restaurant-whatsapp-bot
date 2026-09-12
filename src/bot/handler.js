/**
 * AI-Powered Bot Message Handler
 * 
 * Uses LLM (z-ai-web-dev-sdk) for natural, human-like conversations.
 * The AI handles ALL messages naturally - no limited commands!
 * 
 * Flow:
 * 1. AI generates natural response to ANY customer message
 * 2. AI can detect order intent and trigger order flow
 * 3. State machine still handles structured order collection
 * 4. AI responses are conversational and contextual
 */

const aiAgent = require('./ai-agent');

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

// Conversation history cache (per customer per restaurant)
const conversationHistory = new Map(); // key: restaurantId:phone -> [{role, content}]

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
  // Keep only last 20 messages
  if (history.length > 20) {
    history.shift();
  }
}

// ==================== HELPER FUNCTIONS ====================

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
  
  // Operating hours check
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
  
  // Menu items with categories
  const menuItems = prepare(`
    SELECT mi.*, mc.name as category_name 
    FROM menu_items mi 
    LEFT JOIN menu_categories mc ON mi.category_id = mc.id 
    WHERE mi.restaurant_id = ? AND mi.is_available = 1 
    ORDER BY mc.sort_order, mi.sort_order, mi.name
  `).all(restaurantId);
  
  // Active deals
  const deals = prepare(`
    SELECT * FROM deals WHERE restaurant_id = ? AND is_active = 1 
    AND (valid_from IS NULL OR valid_from <= datetime('now'))
    AND (valid_until IS NULL OR valid_until >= datetime('now'))
    ORDER BY sort_order
  `).all(restaurantId);
  
  // All operating hours
  const allHours = prepare('SELECT * FROM operating_hours WHERE restaurant_id = ? ORDER BY day_of_week').all(restaurantId);
  
  // Delivery areas
  const deliveryAreas = prepare('SELECT * FROM delivery_areas WHERE restaurant_id = ? AND is_active = 1').all(restaurantId);
  
  return {
    restaurant,
    isOpen,
    closingTime,
    menuItems,
    deals,
    operatingHours: allHours,
    deliveryAreas
  };
}

function getCustomerContext(restaurantId, customer) {
  if (!customer) return {};
  
  const recentOrders = prepare(`
    SELECT * FROM orders WHERE restaurant_id = ? AND customer_id = ? 
    ORDER BY created_at DESC LIMIT 5
  `).all(restaurantId, customer.id);
  
  const orderCount = recentOrders.length;
  
  return {
    recentOrders,
    isVIP: orderCount >= 10,
    isReturning: orderCount > 0
  };
}

// ==================== MESSAGE SENDING ====================

async function sendTextWithDelay(sock, jid, text) {
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

// ==================== ORDER FLOW HELPERS ====================

function extractItemFromMessage(message, menuItems) {
  return aiAgent.extractItemAndQuantity(message, menuItems);
}

function addToCart(cart, menuItem, qty) {
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
  return cart;
}

async function saveOrder(restaurantId, customer, conv) {
  const cart = JSON.parse(conv.cart_json || '[]');
  if (cart.length === 0) return null;
  
  let cleanPhone = customer.phone;
  if (cleanPhone.startsWith('92')) {
    cleanPhone = '0' + cleanPhone.substring(2);
  }
  if (!cleanPhone.startsWith('0')) {
    cleanPhone = '0' + cleanPhone;
  }
  
  return await saveOrderWithDetails(restaurantId, customer, conv, cleanPhone);
}

async function saveOrderWithDetails(restaurantId, customer, conv, phone) {
  const cart = JSON.parse(conv.cart_json || '[]');
  if (cart.length === 0) {
    console.log('[Bot] Cannot save order - cart is empty');
    return null;
  }
  
  let cleanPhone = phone;
  if (cleanPhone.startsWith('92')) {
    cleanPhone = '0' + cleanPhone.substring(2);
  }
  if (!cleanPhone.startsWith('0')) {
    cleanPhone = '0' + cleanPhone;
  }
  
  const subtotal = calculateSubtotal(cart);
  const restaurant = prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
  const deliveryFee = conv.order_type === 'delivery' ? (restaurant.delivery_fee_default || 100) : 0;
  const taxAmount = restaurant.tax_percentage ? (subtotal * restaurant.tax_percentage / 100) : 0;
  const total = subtotal + deliveryFee + taxAmount;
  
  const address = conv.notes || null;
  const orderId = _generateId('ord_');
  
  console.log('[Bot] Saving order:', {
    orderId,
    restaurantId,
    customerName: customer.name,
    customerPhone: cleanPhone,
    address,
    orderType: conv.order_type,
    items: cart.length,
    subtotal,
    deliveryFee,
    total
  });
  
  prepare(`INSERT INTO orders 
    (id, restaurant_id, customer_id, customer_phone, customer_name, customer_address, order_type, items_json, subtotal, delivery_fee, total, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`).run(
    orderId, restaurantId, customer.id, cleanPhone, customer.name, address,
    conv.order_type, JSON.stringify(cart), subtotal, deliveryFee, total
  );
  
  prepare('INSERT INTO order_status_history (order_id, status) VALUES (?, ?)').run(orderId, 'new');
  prepare('UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + ? WHERE id = ?')
    .run(total, customer.id);
  
  console.log('[Bot] Order saved successfully:', orderId);
  
  return { orderId, total, items: cart, subtotal, deliveryFee, taxAmount };
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
    let phone = String(msg.key.remoteJid || '').split('@')[0];
    
    // Handle LID (WhatsApp privacy feature) - try to resolve to actual phone
    // If it's a LID (starts with non-92 number), we'll use the LID for tracking
    // but try to extract phone from messages later
    const isLID = msg.key.remoteJid && msg.key.remoteJid.endsWith('@lid');
    console.log(`[Bot] From ${phone}${isLID ? ' (LID)' : ''}: "${text}"`);
    
    if (!phone || !text) return;

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
    
    if (minutesSinceLast > 30 && conv.state !== 'idle') {
      updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null });
      conv = getOrCreateConversation(restaurantId, phone);
    }

    // Get context for AI
    const restCtx = getRestaurantContext(restaurantId);
    const custCtx = getCustomerContext(restaurantId, customer);
    const cart = JSON.parse(conv.cart_json || '[]');
    const history = getConversationHistory(restaurantId, phone);

    // Build context object for AI
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
      conversationState: conv.state,
      cart: cart,
      conversationHistory: history
    };

    // Handle based on conversation state
    let aiResponse = '';
    let shouldUpdateHistory = true;

    // Check for cancel command (works in any state)
    if (text.toLowerCase().match(/^(cancel|cancel karo|cancel kar do|rok do|nahi chahiye)/)) {
      updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null, notes: null });
      aiResponse = 'Theek hai, order cancel kar diya. 🙏\n\nKuch aur chahiye toh bataiye!';
      await sendTextWithDelay(sock, msg.key.remoteJid, aiResponse);
      addToHistory(restaurantId, phone, 'user', text);
      addToHistory(restaurantId, phone, 'assistant', aiResponse);
      return;
    }

    // Handle different states
    switch (conv.state) {
      case 'idle':
        // Check if customer wants to order
        if (aiAgent.detectOrderIntent(text) && restCtx.isOpen) {
          // Try to extract item
          const { qty, item } = extractItemFromMessage(text, restCtx.menuItems);
          if (item) {
            // Add to cart and start ordering
            const newCart = addToCart(cart, item, qty);
            updateConversation(restaurantId, phone, { state: 'ordering', cart_json: JSON.stringify(newCart) });
            aiContext.cart = newCart;
            aiContext.conversationState = 'ordering';
          }
        }
        
        // Generate AI response for any message
        aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
        break;

      case 'ordering':
        // Check if customer wants to checkout
        if (text.toLowerCase().match(/^(done|ho gaya|bas itna|finish|complete|checkout|bas kafi|theek hai bas)/)) {
          if (cart.length === 0) {
            aiResponse = 'Aap ka cart khaali hai! Pehle kuch add karein. 😊';
          } else {
            updateConversation(restaurantId, phone, { state: 'awaiting_order_type' });
            aiContext.conversationState = 'awaiting_order_type';
            aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
          }
        } else if (text.toLowerCase() === 'cart' || text.toLowerCase().includes('cart dekho')) {
          // Show cart
          let cartMsg = `Aap ka Cart 🛒\n\n`;
          cart.forEach((item, i) => {
            cartMsg += `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n`;
          });
          cartMsg += `\nSubtotal: Rs. ${calculateSubtotal(cart)}\n\nOrder complete karne k liye "done" likhein!`;
          aiResponse = cartMsg;
        } else if (text.toLowerCase().match(/^(remove|hata|hatao|nikal)/)) {
          // Try to remove item
          const itemName = text.toLowerCase().replace(/^(remove|hata|hatao|nikal)\s*/i, '').trim();
          const idx = cart.findIndex(c => 
            c.name.toLowerCase().includes(itemName) || itemName.includes(c.name.toLowerCase())
          );
          if (idx >= 0) {
            const removed = cart.splice(idx, 1)[0];
            updateConversation(restaurantId, phone, { cart_json: JSON.stringify(cart) });
            aiResponse = `"${removed.name}" cart se hata diya. 🗑️\n\n`;
            if (cart.length > 0) {
              aiResponse += `Ab cart mein:\n`;
              cart.forEach((item, i) => {
                aiResponse += `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n`;
              });
              aiResponse += `\nSubtotal: Rs. ${calculateSubtotal(cart)}\nAur kuch? Ya "done" likhein.`;
            } else {
              aiResponse += 'Cart khaali ho gaya. Naya item add karein!';
            }
          } else {
            aiResponse = `"${itemName}" cart mein nahi mila. 😅\n\n*cart* likh kar dekhein kya kya add hai.`;
          }
        } else {
          // Try to add item to cart
          const { qty, item } = extractItemFromMessage(text, restCtx.menuItems);
          if (item) {
            const newCart = addToCart(cart, item, qty);
            updateConversation(restaurantId, phone, { cart_json: JSON.stringify(newCart) });
            aiContext.cart = newCart;
            aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
          } else {
            // Regular chat - let AI respond
            aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
          }
        }
        break;

      case 'awaiting_order_type':
        const orderType = aiAgent.detectOrderType(text);
        if (orderType) {
          updateConversation(restaurantId, phone, { state: 'awaiting_name', order_type: orderType });
          aiContext.conversationState = 'awaiting_name';
          aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
        } else {
          aiResponse = 'Bhai, "1" (delivery) ya "2" (pickup) likhein. 🙏';
        }
        break;

      case 'awaiting_name':
        // Use AI to extract name, phone, address from the message
        // Customer might send everything at once
        const details1 = await aiAgent.extractOrderDetails(text);
        console.log('[Bot] Extracted details (awaiting_name):', details1);
        
        if (details1.name) {
          prepare('UPDATE customers SET name = ? WHERE id = ?').run(details1.name, customer.id);
          customer.name = details1.name;
        }
        
        if (details1.address) {
          prepare('UPDATE bot_conversations SET notes = ? WHERE id = ?').run(details1.address, conv.id);
        }
        
        if (details1.phone && details1.phone.length >= 10) {
          // Customer provided phone too! Use it directly
          let cleanPhone = details1.phone;
          if (cleanPhone.startsWith('92')) cleanPhone = '0' + cleanPhone.substring(2);
          if (!cleanPhone.startsWith('0')) cleanPhone = '0' + cleanPhone;
          
          // Skip to confirmation - we have everything!
          const orderResult = await saveOrderWithDetails(restaurantId, customer, conv, cleanPhone);
          if (orderResult) {
            updateConversation(restaurantId, phone, { 
              state: 'awaiting_confirmation',
              cart_json: JSON.stringify({ orderId: orderResult.orderId })
            });
            aiContext.conversationState = 'awaiting_confirmation';
            aiContext.cart = orderResult.items;
            aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
          }
        } else if (details1.address) {
          // Customer provided name + address, still need phone
          updateConversation(restaurantId, phone, { state: 'awaiting_phone' });
          aiContext.conversationState = 'awaiting_phone';
          aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
        } else {
          // Just name provided
          updateConversation(restaurantId, phone, { state: 'awaiting_address' });
          aiContext.conversationState = 'awaiting_address';
          if (conv.order_type === 'delivery') {
            aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
          } else {
            updateConversation(restaurantId, phone, { state: 'awaiting_phone' });
            aiContext.conversationState = 'awaiting_phone';
            aiResponse = 'Phone number bata dijiye delivery confirmation k liye. 📱';
          }
        }
        break;

      case 'awaiting_address':
        // Use AI to extract address (and maybe phone)
        const details2 = await aiAgent.extractOrderDetails(text);
        console.log('[Bot] Extracted details (awaiting_address):', details2);
        
        if (details2.address) {
          prepare('UPDATE bot_conversations SET notes = ? WHERE id = ?').run(details2.address, conv.id);
        }
        
        if (details2.phone && details2.phone.length >= 10) {
          // Phone also provided! Save order
          let cleanPhone = details2.phone;
          if (cleanPhone.startsWith('92')) cleanPhone = '0' + cleanPhone.substring(2);
          if (!cleanPhone.startsWith('0')) cleanPhone = '0' + cleanPhone;
          
          const orderResult = await saveOrderWithDetails(restaurantId, customer, conv, cleanPhone);
          if (orderResult) {
            updateConversation(restaurantId, phone, { 
              state: 'awaiting_confirmation',
              cart_json: JSON.stringify({ orderId: orderResult.orderId })
            });
            aiContext.conversationState = 'awaiting_confirmation';
            aiContext.cart = orderResult.items;
            aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
          }
        } else {
          updateConversation(restaurantId, phone, { state: 'awaiting_phone' });
          aiContext.conversationState = 'awaiting_phone';
          aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
        }
        break;

      case 'awaiting_phone':
        // Use AI to extract phone
        const details3 = await aiAgent.extractOrderDetails(text);
        console.log('[Bot] Extracted details (awaiting_phone):', details3);
        
        const phoneInput = details3.phone || text.replace(/[^0-9]/g, '');
        if (phoneInput && phoneInput.length >= 10) {
          let cleanPhone = phoneInput;
          if (cleanPhone.startsWith('92')) cleanPhone = '0' + cleanPhone.substring(2);
          if (!cleanPhone.startsWith('0')) cleanPhone = '0' + cleanPhone;
          
          const orderResult = await saveOrderWithDetails(restaurantId, customer, conv, cleanPhone);
          if (orderResult) {
            updateConversation(restaurantId, phone, { 
              state: 'awaiting_confirmation',
              cart_json: JSON.stringify({ orderId: orderResult.orderId })
            });
            aiContext.conversationState = 'awaiting_confirmation';
            aiContext.cart = orderResult.items;
            aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
          }
        } else {
          aiResponse = 'Sahi phone number likhein (kam az kam 10 digits). 📱';
        }
        break;

      case 'awaiting_confirmation':
        if (aiAgent.detectConfirmation(text)) {
          // Confirm order
          const tempData = JSON.parse(conv.cart_json || '{}');
          if (tempData.orderId) {
            const order = prepare('SELECT * FROM orders WHERE id = ?').get(tempData.orderId);
            if (order) {
              prepare("UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
              prepare('INSERT INTO order_status_history (order_id, status) VALUES (?, ?)').run(order.id, 'confirmed');
              
              aiContext.conversationState = 'confirmed';
              aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
              
              // Notify restaurant dashboard
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
          }
        } else if (text.toLowerCase().match(/^(cancel|nahi|no)/)) {
          updateConversation(restaurantId, phone, { state: 'idle', cart_json: '[]', order_type: null });
          aiResponse = 'Order cancel ho gaya. 🙏 Kuch aur chahiye toh bataiye!';
        } else {
          aiResponse = 'Bhai, "confirm" ya "cancel" likhein. 🙏';
        }
        break;

      default:
        updateConversation(restaurantId, phone, { state: 'idle' });
        aiResponse = await aiAgent.generateResponse(restaurant, customer, text, aiContext);
    }

    // Send the response
    if (aiResponse) {
      await sendTextWithDelay(sock, msg.key.remoteJid, aiResponse);
      
      // Add to conversation history
      if (shouldUpdateHistory) {
        addToHistory(restaurantId, phone, 'user', text);
        addToHistory(restaurantId, phone, 'assistant', aiResponse);
      }
    }
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
        message = `✅ Aap ka order *${order.id}* deliver ho gaya!\n\nKhana kaisa laga? Humari service kaisi rahi? Feedback zaroor dein! 🙏\n\nDobara order k liye "menu" likhein! 😊`;
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
