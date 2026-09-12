/**
 * AI-Powered Restaurant Agent
 * 
 * Uses LLM (z-ai-web-dev-sdk) for natural, human-like conversations.
 * - Understands ANY message naturally
 * - Replies in Roman Urdu/English (Pakistani style)
 * - Handles orders, menu, deals, FAQs, small talk - everything naturally
 * - Context-aware (remembers customer history)
 * - Restaurant-aware (knows menu, hours, deals)
 */

let zaiInstance = null;

async function getZAI() {
  if (!zaiInstance) {
    const ZAI = require('z-ai-web-dev-sdk').default;
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

/**
 * Build system prompt for the restaurant agent
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
    conversationState = 'idle',
    cart = []
  } = context;

  // Build menu summary
  let menuSummary = 'No menu items yet';
  if (menuItems.length > 0) {
    const categories = {};
    menuItems.forEach(item => {
      const cat = item.category_name || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(`${item.name} (Rs. ${item.price})`);
    });
    menuSummary = Object.entries(categories)
      .map(([cat, items]) => `${cat}:\n  - ${items.join('\n  - ')}`)
      .join('\n');
  }

  // Build deals summary
  let dealsSummary = 'No active deals';
  if (deals.length > 0) {
    dealsSummary = deals.map(d => 
      `${d.name} - Rs. ${d.deal_price}${d.original_price ? ` (was Rs. ${d.original_price})` : ''}${d.description ? ` - ${d.description}` : ''}`
    ).join('\n');
  }

  // Build hours summary
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let hoursSummary = 'Hours not set (default: 11 AM - 11 PM daily)';
  if (operatingHours.length > 0) {
    hoursSummary = operatingHours.map(h => 
      `${days[h.day_of_week]}: ${h.is_closed ? 'Closed' : `${h.open_time} - ${h.close_time}`}`
    ).join('\n');
  }

  // Build delivery areas
  let deliverySummary = 'Delivery: Rs. 100 default (3-5 km), 30-45 min';
  if (deliveryAreas.length > 0) {
    deliverySummary = deliveryAreas.map(a => 
      `${a.name}: Rs. ${a.delivery_fee}${a.estimated_time ? ` (${a.estimated_time})` : ''}`
    ).join('\n');
  }

  // Build cart summary if ordering
  let cartSummary = '';
  if (cart.length > 0) {
    cartSummary = `\n\nCURRENT CART:\n${cart.map((item, i) => 
      `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}`
    ).join('\n')}\nSubtotal: Rs. ${cart.reduce((s, i) => s + (i.qty * i.price), 0)}`;
  }

  // Build recent orders summary
  let ordersSummary = '';
  if (recentOrders.length > 0) {
    const lastOrder = recentOrders[0];
    const daysAgo = Math.floor((Date.now() - new Date(lastOrder.created_at).getTime()) / 86400000);
    ordersSummary = `\n\nCUSTOMER HISTORY:\n- Total orders: ${recentOrders.length}\n- Last order: ${daysAgo} days ago (Rs. ${lastOrder.total})\n- Status: ${lastOrder.status}`;
  }

  return `You are ${restaurant.name}'s WhatsApp agent - a friendly, warm, professional restaurant staff member chatting with customers on WhatsApp.

CRITICAL RULES:
1. ALWAYS reply in Roman Urdu/English (Pakistani style - like how people actually text on WhatsApp in Pakistan)
2. Keep replies SHORT (1-3 lines max) - like real WhatsApp texting, NOT long paragraphs
3. Use emojis naturally (1-2 per message, not excessive)
4. Be warm, friendly, and helpful - like a real human staff member
5. NEVER say you're an AI or bot - you're a real person working at the restaurant
6. Don't use formal English - use casual Roman Urdu like friends text each other
7. If customer asks something you don't know, be honest but helpful

RESTAURANT INFO:
- Name: ${restaurant.name}
- Owner: ${restaurant.owner_name || 'N/A'}
- Phone: ${restaurant.phone}
- Address: ${restaurant.address || 'Not set'}
- Currency: ${restaurant.currency || 'Rs.'}
- Delivery fee: Rs. ${restaurant.delivery_fee_default || 100}
- Min order: Rs. ${restaurant.min_order_amount || 0}
- Tax: ${restaurant.tax_percentage || 0}%
- Currently: ${isOpen ? 'OPEN' : 'CLOSED'}${closingTime ? ` (closes at ${closingTime})` : ''}

MENU:
${menuSummary}

ACTIVE DEALS:
${dealsSummary}

OPERATING HOURS:
${hoursSummary}

DELIVERY AREAS:
${deliverySummary}
${ordersSummary}${cartSummary}

CUSTOMER INFO:
- Name: ${customer?.name || 'New customer'}
- Phone: ${customer?.phone}
${isVIP ? '- ⭐ VIP CUSTOMER (10+ orders) - give special treatment!' : ''}
${isReturning ? '- Returning customer' : '- First time customer'}

CONVERSATION STATE: ${conversationState}
${conversationState === 'ordering' ? 'Customer is currently ordering. Help them add items to cart. When they say "done", proceed to checkout.' : ''}
${conversationState === 'awaiting_order_type' ? 'Ask if delivery or pickup.' : ''}
${conversationState === 'awaiting_name' ? 'Ask customer name.' : ''}
${conversationState === 'awaiting_address' ? 'Ask delivery address.' : ''}
${conversationState === 'awaiting_phone' ? 'Ask phone number for delivery confirmation.' : ''}
${conversationState === 'awaiting_confirmation' ? 'Show order summary and ask to confirm.' : ''}

HOW TO HANDLE ORDERS:
- If customer wants to order something from menu, confirm it's added to cart
- For quantity, parse "2x biryani" or "biryani 2" as 2 plates
- When cart has items and customer says "done"/"ho gaya"/"bas", tell them to choose delivery (1) or pickup (2)
- Collect: name → address (if delivery) → phone → show summary → confirm
- Always mention total amount and order ID format like "ord_xxx"

IMPORTANT: Reply in 1-3 lines only, conversational, like real WhatsApp texting. Be helpful and friendly!`;
}

/**
 * Generate AI response for customer message
 */
async function generateResponse(restaurant, customer, customerMessage, context = {}) {
  try {
    const zai = await getZAI();
    const systemPrompt = buildSystemPrompt(restaurant, customer, context);
    
    // Build conversation history
    const messages = [
      { role: 'assistant', content: systemPrompt }
    ];
    
    // Add recent conversation history if available
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      // Keep only last 10 messages to avoid token limit
      const recentHistory = context.conversationHistory.slice(-10);
      recentHistory.forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });
    }
    
    // Add current customer message
    messages.push({
      role: 'user',
      content: customerMessage
    });

    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
      temperature: 0.7, // Slightly creative but consistent
      max_tokens: 200 // Keep responses short
    });

    const response = completion.choices[0]?.message?.content;
    
    if (!response || response.trim().length === 0) {
      return getFallbackResponse(customerMessage);
    }
    
    return response.trim();
  } catch (error) {
    console.error('[AI] Error generating response:', error.message);
    return getFallbackResponse(customerMessage);
  }
}

/**
 * Fallback response if AI fails
 */
function getFallbackResponse(message) {
  const lower = message.toLowerCase();
  
  if (lower.includes('salam') || lower.includes('assalam') || lower.includes('hi') || lower.includes('hello')) {
    return 'Assalam o Alaikum! 🌟 Restaurant mein khush aamdeed! Bataiye kya khilaoon? 😊';
  }
  if (lower.includes('menu')) {
    return 'Hamara menu dekhne k liye "menu" likhein! 😊';
  }
  if (lower.includes('order')) {
    return 'Order karne k liye item ka naam likhein, jaise "2x Chicken Biryani" 😊';
  }
  if (lower.includes('shukriya') || lower.includes('thank')) {
    return 'Aray nahi, thank you toh aap ka! 😊';
  }
  if (lower.includes('allah hafiz') || lower.includes('bye')) {
    return 'Allah hafiz! Phir milte hain! 👋';
  }
  
  return 'Bataiye, kya help karoon? 😊 Menu, order, deals - kuch bhi pooch lein!';
}

/**
 * Detect if customer wants to place an order (for state machine)
 */
function detectOrderIntent(message) {
  const lower = message.toLowerCase();
  
  // Direct order commands
  if (/^(order|new order|place order|kar do order|khana order|pizza chahiye|biryani chahiye|mujhe .+ chahiye)/.test(lower)) {
    return true;
  }
  
  // Item name + quantity pattern
  if (/\d+\s*x\s|x\s*\d+|plate|portion|piece|burger|pizza|biryani|karahi|tikka|kebab|kabab|cola|drink|water/i.test(lower)) {
    return true;
  }
  
  return false;
}

/**
 * Detect if customer confirms order
 */
function detectConfirmation(message) {
  const lower = message.toLowerCase();
  return /^(confirm|yes|haan|ok|okay|theek|pakka|kar do|karein|ho jaye|done|kar dein)/.test(lower) ||
         lower === 'haan' || lower === 'ok' || lower === 'yes';
}

/**
 * Detect if customer wants delivery or pickup
 */
function detectOrderType(message) {
  const lower = message.toLowerCase();
  if (lower.includes('deliver') || lower === '1' || lower.includes('ghar par')) {
    return 'delivery';
  }
  if (lower.includes('pickup') || lower.includes('pick') || lower === '2' || lower.includes('le jayein') || lower.includes('udhar se')) {
    return 'pickup';
  }
  return null;
}

/**
 * Extract item name and quantity from message
 */
function extractItemAndQuantity(message, menuItems) {
  // Try to find quantity
  let qty = 1;
  let qtyMatch = message.match(/(\d+)\s*x/i) || message.match(/x\s*(\d+)/i) || message.match(/(\d+)\s*(?:plate|portion|piece)/i);
  if (qtyMatch) {
    qty = Math.min(parseInt(qtyMatch[1]), 20);
  } else {
    const numMatch = message.match(/(\d+)/);
    if (numMatch) {
      qty = Math.min(parseInt(numMatch[1]), 20);
    }
  }
  
  // Try to find item name
  const lower = message.toLowerCase();
  let foundItem = null;
  
  // Exact match
  foundItem = menuItems.find(i => lower.includes(i.name.toLowerCase()));
  
  // Partial match
  if (!foundItem) {
    foundItem = menuItems.find(i => {
      const itemName = i.name.toLowerCase();
      const words = itemName.split(/\s+/);
      return words.some(w => w.length > 3 && lower.includes(w));
    });
  }
  
  // Word match
  if (!foundItem) {
    foundItem = menuItems.find(i => {
      const itemName = i.name.toLowerCase();
      return lower.split(/\s+/).some(w => w.length > 3 && itemName.includes(w));
    });
  }
  
  return { qty, item: foundItem };
}

module.exports = {
  generateResponse,
  getFallbackResponse,
  detectOrderIntent,
  detectConfirmation,
  detectOrderType,
  extractItemAndQuantity,
  buildSystemPrompt
};
