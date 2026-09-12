/**
 * Roman English (Urdu in Latin script) Bot Response Templates
 * 
 * All customer-facing text uses Roman English so the bot feels natural
 * to Pakistani/Indian customers who chat in Roman English.
 */

const responses = {
  // Greeting (first message)
  greeting: (restaurantName) => 
    `*Assalam o Alaikum!* 🌟\n\n` +
    `${restaurantName} mein khush aamdeed!\n\n` +
    `Hum aap ki khidmat mein hazir hain. Niche di gayi commands use karein:\n\n` +
    `*Menu* - Hamara menu dekhein\n` +
    `*Order* - Naya order place karein\n` +
    `*Status* - Apne order ki status dekhein\n` +
    `*Help* - Madad chahein\n\n` +
    `Aap simply "menu" likh kar bhejein!`,

  // Returning customer
  welcomeBack: (restaurantName, customerName) =>
    `*Wapis khush aamdeed!* 🎉\n\n` +
    `${customerName ? customerName + ' bhai' : 'Aap'}! ${restaurantName} mein aap ka swagat hai.\n\n` +
    `*Menu* likhein menu dekhne k liye\n` +
    `*Order* likhein naya order karne k liye`,

  // Help message
  help: () =>
    `*Madad* 🤝\n\n` +
    `Available commands:\n\n` +
    `*menu* - Menu dekhein\n` +
    `*order* - Naya order shuru karein\n` +
    `*status* - Order status check karein\n` +
    `*cancel* - Chal raha order cancel karein\n` +
    `*hours* - Humari khulne ka waqt\n` +
    `*contact* - Hum se rabta karein\n` +
    `*help* - Yeh message dobara dekhein`,

  // Menu display
  menuHeader: (restaurantName) =>
    `*${restaurantName} - Menu* 🍽️\n\n`,
  
  menuCategory: (categoryName) =>
    `\n*${categoryName}*\n`,
  
  menuItem: (item) =>
    `• ${item.name} - Rs. ${item.price}\n` +
    (item.description ? `  _${item.description}_\n` : ''),

  menuFooter: () =>
    `\n*Order karne k liye "order" likhein!*\n` +
    `Example: "2x Chicken Biryani" ya "Chicken Biryani 2 portion"`,

  // Order flow
  orderStarted: () =>
    `*Order Shuru!* 🛒\n\n` +
    `Acha! Bataiye aap kya order karna chahenge?\n\n` +
    `Item likhne ka tarika:\n` +
    `• "Chicken Biryani 2" (2 plates)\n` +
    `• "2x Burger" (2 burgers)\n` +
    `• "Pizza" (1 by default)\n\n` +
    `*done* likhein jab cart complete ho jaye\n` +
    `*menu* likhein menu dobara dekhne k liye\n` +
    `*cancel* likhein order cancel karne k liye`,

  itemAdded: (item) =>
    `✅ *Add ho gaya!*\n` +
    `${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n\n` +
    `Aur kuch chahiye? Ya *done* likhein order complete karne k liye.`,

  itemNotFound: (itemName) =>
    `⚠️ "${itemName}" humare menu mein nahi mila.\n\n` +
    `*menu* likhein menu dobara dekhein.`,

  cartEmpty: () =>
    `🛒 Aap ka cart khaali hai!\n` +
    `Pehle kuch items add karein. *menu* likhein menu dekhne k liye.`,

  cartSummary: (items, subtotal) => {
    let msg = `*Aap ka Cart* 🛒\n\n`;
    items.forEach((item, i) => {
      msg += `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n`;
    });
    msg += `\n*Subtotal: Rs. ${subtotal}*\n\n`;
    msg += `*Delivery* ya *Pickup* chunne k liye likhein.`;
    return msg;
  },

  askOrderType: () =>
    `Order type chuniye:\n\n` +
    `*1.* Delivery (ghar par)\n` +
    `*2.* Pickup (restaurant se)\n\n` +
    `"1" ya "delivery" likhein, ya "2" ya "pickup" likhein.`,

  askName: () =>
    `Apna naam bataiye? (taake hum aap ko pehchane)`,

  askAddress: () =>
    `📍 Apna delivery address bhejein.\n\n` +
    `Example: "House 123, Block B, Gulshan-e-Iqbal, Karachi"`,

  askPhone: () =>
    `📞 Apna active phone number bhejein (delivery k liye):\n` +
    `Example: 03001234567`,

  orderConfirmation: (order) => {
    let msg = `*Order Summary* 📝\n\n`;
    order.items.forEach((item, i) => {
      msg += `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n`;
    });
    msg += `\n*Subtotal:* Rs. ${order.subtotal}\n`;
    if (order.order_type === 'delivery') {
      msg += `*Delivery Fee:* Rs. ${order.delivery_fee}\n`;
    }
    msg += `*Total: Rs. ${order.total}*\n\n`;
    msg += `Name: ${order.customer_name}\n`;
    msg += `Phone: ${order.customer_phone}\n`;
    if (order.customer_address) {
      msg += `Address: ${order.customer_address}\n`;
    }
    msg += `Type: ${order.order_type}\n\n`;
    msg += `*Confirm karne k liye "confirm" likhein*\n`;
    msg += `*Cancel karne k liye "cancel" likhein*`;
    return msg;
  },

  orderConfirmed: (orderId, total) =>
    `✅ *Order Confirmed!* 🎉\n\n` +
    `Order ID: *${orderId}*\n` +
    `Total: *Rs. ${total}*\n\n` +
    `Restaurant ko aap ka order mil gaya hai. Hum jald hi confirmation bhejenge.\n\n` +
    `Status check karne k liye *status* likhein.\n\n` +
    `Shukriya! ${orderId.substring(0, 6)}`,

  orderCancelled: () =>
    `❌ Order cancel kar diya gaya.\n\n` +
    `Kuch aur chahiye to *menu* likhein.`,

  // Status updates (sent by restaurant dashboard)
  statusNew: (orderId) =>
    `📦 Order *${orderId}* mil gaya hai!\n` +
    `Hum jald hi confirm karenge. Shukriya sabr k liye.`,

  statusConfirmed: (orderId) =>
    `✅ Order *${orderId}* confirm ho gaya!\n` +
    `Kitchen mein bhej diya gaya hai.`,

  statusPreparing: (orderId) =>
    `👨‍🍳 Aap ka order *${orderId}* tayyar ho raha hai...`,

  statusReady: (orderId, orderType) => {
    if (orderType === 'pickup') {
      return `🔔 Order *${orderId}* ready hai!\n` +
             `Aap restaurant se le ja sakte hain. Shukriya!`;
    }
    return `🛵 Order *${orderId}* ready hai!\n` +
           `Delivery boy jald hi nikal jayega. Thodi der rukhey!`;
  },

  statusDelivered: (orderId) =>
    `✅ Order *${orderId}* deliver ho gaya!\n\n` +
    `Hamari service kaisi lagi? Aap ka feedback hum k liye ahem hai.\n\n` +
    `Dobara khana k liye *menu* likhein!`,

  statusCancelled: (orderId, reason) =>
    `❌ Order *${orderId}* cancel kar diya gaya.\n` +
    (reason ? `Waja: ${reason}\n` : '') +
    `Maaf kijeye ga. Koi aur cheez order karne k liye *menu* likhein.`,

  // Last order status
  lastOrderStatus: (order) => {
    const statusMap = {
      'new': '🟡 Mil gaya - confirmation pending',
      'confirmed': '✅ Confirm ho gaya',
      'preparing': '👨‍🍳 Tayyar ho raha hai',
      'ready': '🔔 Ready hai!',
      'delivered': '✅ Deliver ho gaya',
      'cancelled': '❌ Cancel ho gaya'
    };
    return `*Aap ka Last Order* 📋\n\n` +
           `Order ID: ${order.id}\n` +
           `Status: ${statusMap[order.status] || order.status}\n` +
           `Total: Rs. ${order.total}\n` +
           `Date: ${new Date(order.created_at).toLocaleString()}`;
  },

  noOrders: () =>
    `Aap ka koi order nahi mila.\n\n` +
    `Naya order karne k liye *order* likhein!`,

  // Restaurant info
  hours: (restaurantName) =>
    `*${restaurantName} - Khulne ka Waqt* ⏰\n\n` +
    `Monday - Sunday: 11:00 AM se 11:00 PM tak\n\n` +
    `Ramzan mein: Iftar se Sehar tak`,

  contact: (restaurantName, phone, address) =>
    `*${restaurantName} - Rabta* 📞\n\n` +
    `Phone: ${phone}\n` +
    (address ? `Address: ${address}\n` : '') +
    `\nAap yahan se bhi order kar sakte hain!`,

  // Errors
  somethingWrong: () =>
    `⚠️ Kuch masla ho gaya. Dobari koshish karein.\n\n` +
    `Madad k liye *help* likhein.`,

  invalidChoice: () =>
    `⚠️ Samajh nahi aaya. Kripya sahi command likhein.\n\n` +
    `*menu* - Menu dekhein\n` +
    `*order* - Order karein\n` +
    `*help* - Madad`,

  timeout: () =>
    `Aap ka order session khatam ho gaya (30 min).\n\n` +
    `Dobara order karne k liye *order* likhein.`
};

module.exports = responses;
