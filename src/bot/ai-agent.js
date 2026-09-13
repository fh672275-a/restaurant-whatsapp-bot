/**
 * AI-Powered Restaurant Agent (Fully Autonomous)
 * 
 * AI handles EVERYTHING - no rigid state machine!
 * - Parses any message naturally
 * - Extracts: items, quantity, delivery type, name, phone, address
 * - Decides what action to take (add to cart, save order, etc.)
 * - Replies in natural Roman Urdu
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
 * Build system prompt for natural conversation
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

  let dealsSummary = 'No active deals';
  if (deals.length > 0) {
    dealsSummary = deals.map(d => 
      `${d.name} - Rs. ${d.deal_price}${d.original_price ? ` (was Rs. ${d.original_price})` : ''}`
    ).join('\n');
  }

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let hoursSummary = '11 AM - 11 PM daily (default)';
  if (operatingHours.length > 0) {
    hoursSummary = operatingHours.map(h => 
      `${days[h.day_of_week]}: ${h.is_closed ? 'Closed' : `${h.open_time} - ${h.close_time}`}`
    ).join('\n');
  }

  let deliverySummary = 'Delivery: Rs. 100 (3-5 km), 30-45 min';
  if (deliveryAreas.length > 0) {
    deliverySummary = deliveryAreas.map(a => 
      `${a.name}: Rs. ${a.delivery_fee}${a.estimated_time ? ` (${a.estimated_time})` : ''}`
    ).join('\n');
  }

  let cartSummary = '';
  if (cart.length > 0) {
    const subtotal = cart.reduce((s, i) => s + (i.qty * i.price), 0);
    cartSummary = `\n\nCURRENT CART:\n${cart.map((item, i) => 
      `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}`
    ).join('\n')}\nSubtotal: Rs. ${subtotal}`;
  }

  let ordersSummary = '';
  if (recentOrders.length > 0) {
    const lastOrder = recentOrders[0];
    const daysAgo = Math.floor((Date.now() - new Date(lastOrder.created_at).getTime()) / 86400000);
    ordersSummary = `\n\nCUSTOMER: ${recentOrders.length} orders, last ${daysAgo} days ago`;
  }

  return `You are ${restaurant.name}'s WhatsApp agent - a friendly Pakistani restaurant staff member.

CRITICAL RULES:
1. ALWAYS reply in Roman Urdu/English (Pakistani WhatsApp style)
2. Keep replies SHORT (1-3 lines max) - like real WhatsApp texting
3. Use 1-2 emojis naturally
4. Be warm, friendly, helpful - like a real human
5. NEVER say you're an AI/bot
6. Don't be formal - use casual Roman Urdu

RESTAURANT INFO:
- Name: ${restaurant.name}
- Phone: ${restaurant.phone}
- Address: ${restaurant.address || 'Not set'}
- Currently: ${isOpen ? 'OPEN' : 'CLOSED'}${closingTime ? ` (closes ${closingTime})` : ''}
- Delivery fee: Rs. ${restaurant.delivery_fee_default || 100}
- Min order: Rs. ${restaurant.min_order_amount || 0}

MENU:
${menuSummary}

ACTIVE DEALS:
${dealsSummary}

HOURS:
${hoursSummary}

DELIVERY AREAS:
${deliverySummary}
${ordersSummary}${cartSummary}

CUSTOMER INFO:
- Name: ${customer?.name || 'New customer'}
- Phone: ${customer?.phone}
${isVIP ? '- ⭐ VIP CUSTOMER!' : ''}
${isReturning ? '- Returning customer' : '- First time'}

INSTRUCTIONS:
- Help customer with orders naturally
- If they want to order, help them - don't make them follow rigid steps
- If they provide name/phone/address in any format, accept it
- Be conversational, not robotic
- Keep it short like real WhatsApp texting`;
}

/**
 * Parse customer message and extract order intent + details
 * This is the KEY function - AI decides what to do
 */
async function parseCustomerMessage(message, menuItems, cart = []) {
  try {
    const zai = await getZAI();
    
    const menuSummary = menuItems.map(m => `${m.name} (Rs. ${m.price})`).join(', ');
    
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: `You are an order parser for a restaurant WhatsApp bot. Parse the customer's message and extract order information.

Return ONLY valid JSON (no markdown, no code blocks). Format:
{
  "action": "add_items | checkout | confirm | cancel | chat | ask_info",
  "items": [{"name": "exact menu item name", "qty": 1}],
  "order_type": "delivery | pickup | null",
  "customer_name": "string or null",
  "customer_phone": "string or null", 
  "customer_address": "string or null",
  "wants_to_checkout": true/false,
  "wants_to_confirm": true/false,
  "wants_to_cancel": true/false,
  "reply_hint": "what the customer wants (for context)"
}

Actions:
- "add_items": Customer wants to add item(s) to cart
- "checkout": Customer wants to proceed/finish ordering (says "done", "bas", "ho gaya", "that's it")
- "confirm": Customer confirms the order (says "confirm", "yes", "haan", "ok", "kar do")
- "cancel": Customer wants to cancel
- "chat": General chat/question (not ordering)
- "ask_info": Customer is providing info (name, phone, address)

Rules:
- Match items to closest menu item name from: ${menuSummary}
- Default qty is 1
- Extract phone numbers (10+ digits)
- Extract names (person names, not phone/address)
- Extract addresses (location descriptions)
- "wants_to_checkout" = customer says done/finished
- "wants_to_confirm" = customer says yes/confirm/ok
- If message is just greeting/chat, action = "chat"
- Return ONLY JSON, nothing else`
        },
        {
          role: 'user',
          content: message
        }
      ],
      thinking: { type: 'disabled' },
      temperature: 0,
      max_tokens: 300
    });

    const response = completion.choices[0]?.message?.content?.trim();
    
    let jsonStr = response;
    if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }
    
    const parsed = JSON.parse(jsonStr);
    
    // Match items to actual menu items
    if (parsed.items && Array.isArray(parsed.items)) {
      const matchedItems = [];
      for (const item of parsed.items) {
        const menuItem = menuItems.find(m => 
          m.name.toLowerCase() === item.name.toLowerCase() ||
          m.name.toLowerCase().includes(item.name.toLowerCase()) ||
          item.name.toLowerCase().includes(m.name.toLowerCase())
        );
        if (menuItem) {
          matchedItems.push({
            item_id: menuItem.id,
            name: menuItem.name,
            price: menuItem.price,
            qty: Math.min(Math.max(item.qty || 1, 1), 20)
          });
        }
      }
      parsed.items = matchedItems;
    } else {
      parsed.items = [];
    }
    
    // Clean phone
    if (parsed.customer_phone) {
      parsed.customer_phone = parsed.customer_phone.replace(/[^0-9]/g, '');
    }
    
    return parsed;
  } catch (error) {
    console.error('[AI] parseCustomerMessage error:', error.message);
    return {
      action: 'chat',
      items: [],
      order_type: null,
      customer_name: null,
      customer_phone: null,
      customer_address: null,
      wants_to_checkout: false,
      wants_to_confirm: false,
      wants_to_cancel: false,
      reply_hint: 'parse failed'
    };
  }
}

/**
 * Generate natural AI response
 */
async function generateResponse(restaurant, customer, customerMessage, context = {}) {
  try {
    const zai = await getZAI();
    const systemPrompt = buildSystemPrompt(restaurant, customer, context);
    
    const messages = [
      { role: 'assistant', content: systemPrompt }
    ];
    
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      const recentHistory = context.conversationHistory.slice(-10);
      recentHistory.forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });
    }
    
    messages.push({
      role: 'user',
      content: customerMessage
    });

    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
      temperature: 0.7,
      max_tokens: 200
    });

    const response = completion.choices[0]?.message?.content;
    
    if (!response || response.trim().length === 0) {
      return getFallbackResponse(customerMessage);
    }
    
    return response.trim();
  } catch (error) {
    console.error('[AI] generateResponse error:', error.message);
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
  
  return 'Bataiye, kya help karoon? 😊';
}

module.exports = {
  generateResponse,
  getFallbackResponse,
  parseCustomerMessage,
  buildSystemPrompt
};
