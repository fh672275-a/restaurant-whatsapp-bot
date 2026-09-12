/**
 * Roman English Conversational Bot Responses
 * 
 * Bot feels like a real human chatting on WhatsApp.
 * - Uses casual Roman English
 * - Shows personality and warmth
 * - Handles small talk naturally
 * - Remembers context
 */

const responses = {
  // ==================== GREETINGS & SMALL TALK ====================
  
  greeting: (restaurantName, timeOfDay) => 
    `Assalam o Alaikum! 🌟\n\n` +
    `${restaurantName} mein aap ka khush aamdeed hai!\n\n` +
    `Main hoon yahan aap ki khidmat mein. Aap bataiye:\n\n` +
    `👉 *menu* - dekhein kya kya ban raha hai\n` +
    `👉 *order* - naya order karein\n` +
    `👉 *status* - pehle wala order kahan pohancha\n\n` +
    `Bas bata dijiye kya chahiye, baat toh main kar leta hoon! 😊`,

  welcomeBack: (restaurantName, customerName, lastOrderDays) => {
    let msg = `Arre! ${customerName} bhai, wapis khush aamdeed! 🎉\n\n`;
    if (lastOrderDays !== null && lastOrderDays !== undefined) {
      if (lastOrderDays === 0) {
        msg += `Aaj hi toh order diya tha! Aur kuch chahiye? 😄\n\n`;
      } else if (lastOrderDays === 1) {
        msg += `Kal hi toh order diya tha! Dobara kya khilaoon? 😊\n\n`;
      } else {
        msg += `${lastOrderDays} din pehle aaye the. Kya khilaoo aap ko aaj? 😊\n\n`;
      }
    } else {
      msg += `Khana order karne k liye *order* likh dein, ya *menu* dekh lein! 😊\n\n`;
    }
    msg += `👉 *menu* - menu dekhein\n` +
           `👉 *order* - naya order karein\n` +
           `👉 *status* - last order check karein`;
    return msg;
  },

  // Casual greetings based on time
  timeGreeting: (hour) => {
    if (hour < 12) return 'Subah bakhair! ☀️';
    if (hour < 17) return 'Assalam o Alaikum! 🌤️';
    if (hour < 21) return 'Shaam bakhair! 🌆';
    return 'Raat bakhair! 🌙';
  },

  // Thanks responses
  thanks: () => {
    const replies = [
      'Aray nahi nahi, thank you toh aap ka! 😊',
      'Aap ka aana hamari khushi hai! 🙏',
      'Koi baat nahi bhai, hamesha welcome! 😄',
      'Pakka! Aur kuch chahiye toh bata dena! 👍'
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  },

  // ==================== HELP & INFO ====================
  
  help: () =>
    `Bilkul bata deta hoon! 🤝\n\n` +
    `Aap yeh sab kar sakte hain:\n\n` +
    `🍽️ *menu* - dekhein hamara poora menu\n` +
    `🛒 *order* - naya order shuru karein\n` +
    `📊 *status* - chal raha order kahan hai\n` +
    `❌ *cancel* - chal raha order cancel karein\n` +
    `🕐 *hours* - khulne band k waqt\n` +
    `📍 *address* - hamara location\n` +
    `💳 *payment* - kaise paise dene hain\n` +
    `❓ *help* - yeh message dobara\n\n` +
    `Ya phir simply bata dijiye kya khana hai! 😊`,

  hours: (restaurantName) =>
    `${restaurantName} - Khulne ka Waqt ⏰\n\n` +
    `Subah 11 baje se raat 11 baje tak.\n` +
    `(Monday - Sunday, har roz khulta hai)\n\n` +
    `Ramzan mein iftar se sehar tak khula rehta hai. 😊`,

  address: (restaurantName, addr) =>
    `Hamara Location 📍\n\n` +
    `${addr || 'Address available nahi, restaurant se rabta karein.'}\n\n` +
    `Google Maps par search kar lein, mil jayega! 😊`,

  contact: (restaurantName, phone, address) =>
    `${restaurantName} se rabta 📞\n\n` +
    `Phone: ${phone}\n` +
    (address ? `Address: ${address}\n` : '') +
    `WhatsApp: Yehi number!\n\n` +
    `Ya aap yahin se order kar sakte hain, main hoon na! 😊`,

  payment: () =>
    `Payment kaise karein 💳\n\n` +
    `Aap ke paas yeh options hain:\n\n` +
    `💵 Cash on Delivery\n` +
    `📱 EasyPaisa / JazzCash\n` +
    `🏦 Bank Transfer\n\n` +
    `Order k time bata dijiye ga, hum arrange kar denge! 😊`,

  deliveryInfo: () =>
    `Delivery k baare mein 🛵\n\n` +
    `✅ 3-5 km tak: Rs. 100\n` +
    `✅ 5-8 km tak: Rs. 150\n` +
    `✅ 8-12 km tak: Rs. 200\n\n` +
    `12 km se zyada k liye restaurant se confirm karna parega.\n` +
    `Time: 30-45 min lagta hai usually. 😊`,

  // ==================== MENU ====================
  
  menuHeader: (restaurantName) =>
    `Yeh raha hamara menu 🍽️\n\n` +
    `*${restaurantName}*\n\n`,
  
  menuCategory: (categoryName) =>
    `\n*${categoryName}* 👇\n`,
  
  menuItem: (item) =>
    `• ${item.name} - Rs. ${item.price}\n` +
    (item.description ? `  _${item.description}_\n` : ''),

  menuFooter: () =>
    `\n*Order karne k liye "order" likhein!*\n` +
    `Example: "Chicken Biryani 2" ya "2x Burger"\n\n` +
    `Ya phir item ka naam likh dein, main samajh jata hoon! 😊`,

  // ==================== ORDER FLOW ====================
  
  orderStarted: (customerName) =>
    `Chalein shuru karte hain! 🛒\n\n` +
    (customerName ? `${customerName} bhai, ` : '') +
    `bataiye kya khilaoon aap ko?\n\n` +
    `Item likhne ka tareeqa:\n` +
    `👉 "Chicken Biryani 2" (2 plates)\n` +
    `👉 "2x Burger" (2 burgers)\n` +
    `👉 "Pizza" (1 by default)\n\n` +
    `Jab ho jaye toh *done* likhein.\n` +
    `*menu* se menu dobara dekh sakte hain.\n` +
    `*cart* se dekhein kya add kiya.\n` +
    `*remove* se koi item hata dein.\n` +
    `*cancel* se order cancel kar dein.`,

  itemAdded: (item, cartCount, subtotal) => {
    let msg = `✅ Ho gaya!\n` +
              `${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n\n`;
    
    if (cartCount > 1) {
      msg += `Aap ke cart mein ${cartCount} items hain. Subtotal: Rs. ${subtotal}\n\n`;
    }
    
    const prompts = [
      'Aur kuch chahiye? 😊',
      'Aur kya khilaoon?',
      'Koi aur item bhi add karein? Ya *done* likh dein!',
      'Aur kuch? Ya bas itna kaafi hai?',
      'Mazedaar! Aur kya? 😋'
    ];
    msg += prompts[Math.floor(Math.random() * prompts.length)];
    return msg;
  },

  itemNotFound: (itemName) => {
    const replies = [
      `Hmm, "${itemName}" menu mein nahi mila. 😅\n\n*menu* likh kar menu dobara dekhein.`,
      `Aray, "${itemName}" humare paas nahi hai. 😔\nMenu dekh lein, bohat kuch hai!\n\n*menu* likhein.`,
      `"${itemName}" nahi hai hamare menu mein. 🤔\nMenu mein dekhein, kuch aur pasand aaye!`,
      `Sorry bhai, "${itemName}" available nahi. 😞\n*menu* likh kar menu dekhein.`
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  },

  cartEmpty: () =>
    `🛒 Aap ka cart khaali hai abhi!\n\n` +
    `Pehle kuch items add karein. *menu* likhein menu dekhne k liye. 😊`,

  cartSummary: (items, subtotal) => {
    let msg = `Aap ka Cart 🛒\n\n`;
    items.forEach((item, i) => {
      msg += `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n`;
    });
    msg += `\n*Subtotal: Rs. ${subtotal}*\n\n`;
    msg += `Order complete karne k liye *done* likhein.\n` +
           `Koi item hatane k liye *remove* likhein.\n` +
           `Aur kuch add karne k liye naam likhein.`;
    return msg;
  },

  itemRemoved: (itemName, cart) => {
    const subtotal = cart.reduce((s, i) => s + (i.qty * i.price), 0);
    let msg = `✅ "${itemName}" remove kar diya. 🗑️\n\n`;
    if (cart.length > 0) {
      msg += `Ab aap ka cart:\n`;
      cart.forEach((item, i) => {
        msg += `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n`;
      });
      msg += `\nSubtotal: Rs. ${subtotal}\n\n`;
      msg += `Aur kuch? Ya *done* likhein.`;
    } else {
      msg += `Cart khaali ho gaya. Naya item add karein ya *cancel* karein.`;
    }
    return msg;
  },

  itemNotInCart: (itemName) =>
    `Aray, "${itemName}" aap ke cart mein toh hai hi nahi! 😅\n\n` +
    `*cart* likh kar dekhein kya kya add kiya hai.`,

  cartCleared: () =>
    `🧹 Cart khaali kar diya!\n\n` +
    `Naya order k liye items add karein, ya *cancel* likhein.`,

  quantityUpdated: (itemName, newQty, price) =>
    `✅ Updated!\n` +
    `${itemName} ki quantity ${newQty} ho gayi.\n` +
    `Total: Rs. ${newQty * price}\n\n` +
    `Aur kuch? Ya *done* likhein.`,

  askOrderType: () =>
    `Order kaise chahiye? 🤔\n\n` +
    `👉 *1.* Delivery (ghar par)\n` +
    `👉 *2.* Pickup (restaurant se le jayein)\n\n` +
    `Bas 1 ya 2 likh dein!`,

  askName: () =>
    `Aap ka naam bataiye? 😊\n\n` +
    `(Taake agli baar pehchan sakoon!)`,

  askAddress: () =>
    `📍 Address bhej dijiye ga.\n\n` +
    `Example: "House 123, Block B, Gulshan-e-Iqbal, Karachi"\n\n` +
    `Google Maps location ka link bhi chalega! 😊`,

  askPhone: () =>
    `📞 Ek active phone number bata dijiye.\n\n` +
    `(Delivery boy rabta karne k liye)\n` +
    `Example: 03001234567`,

  // ==================== ORDER CONFIRMATION ====================
  
  orderConfirmation: (order) => {
    let msg = `Aap ka order tayyar hai! 📝\n\n`;
    order.items.forEach((item, i) => {
      msg += `${i + 1}. ${item.qty}x ${item.name} - Rs. ${item.qty * item.price}\n`;
    });
    msg += `\n👤 Naam: ${order.customer_name || '-'}\n`;
    msg += `📞 Phone: ${order.customer_phone}\n`;
    if (order.customer_address) {
      msg += `📍 Address: ${order.customer_address}\n`;
    }
    msg += `📦 Type: ${order.order_type}\n\n`;
    msg += `💰 Subtotal: Rs. ${order.subtotal}\n`;
    if (order.order_type === 'delivery') {
      msg += `🛵 Delivery: Rs. ${order.delivery_fee}\n`;
    }
    msg += `*Total: Rs. ${order.total}*\n\n`;
    msg += `Order confirm karne k liye *confirm* likhein.\n` +
           `Cancel k liye *cancel* likhein.\n\n` +
           `Kuch change karna ho toh bata dein! 😊`;
    return msg;
  },

  orderConfirmed: (orderId, total) =>
    `🎉 Order Confirm ho gaya!\n\n` +
    `Order ID: *${orderId}*\n` +
    `Total: *Rs. ${total}*\n\n` +
    `Restaurant ko aap ka order mil gaya hai. Hum jald hi confirm karke bata denge.\n\n` +
    `Status check karne k liye *status* likhein.\n\n` +
    `Shukriya aap ke khidmat ka mauqa dene k liye! 😊\n` +
    `Allah hafiz! 👋`,

  orderCancelled: () =>
    `❌ Theek hai, order cancel kar diya.\n\n` +
    `Koi baat nahi! Jab bhi khana ho, *menu* likhein. 😊`,

  // ==================== ORDER STATUS UPDATES ====================
  
  statusNew: (orderId) =>
    `📦 Aap ka order *${orderId}* mil gaya hai!\n\n` +
    `Hum check kar rahe hain, jald hi confirm karenge.\n` +
    `Shukriya sabr ka! 😊`,

  statusConfirmed: (orderId) =>
    `✅ Bhai, aap ka order *${orderId}* confirm ho gaya!\n\n` +
    `Kitchen mein bhej diya gaya hai, tayyar hone laga hai. 👨‍🍳`,

  statusPreparing: (orderId) =>
    `👨‍🍳 Aap ka order *${orderId}* ban raha hai!\n\n` +
    `Taza taza khana ban raha hai aap k liye. Kuch hi der mein ready hoga! 😋`,

  statusReady: (orderId, orderType) => {
    if (orderType === 'pickup') {
      return `🔔 Aap ka order *${orderId}* ready hai!\n\n` +
             `Aap restaurant se le ja sakte hain.\n\n` +
             `Address yeh raha, aa jayein! 🙏`;
    }
    return `🛵 Bhai, aap ka order *${orderId}* ready hai!\n\n` +
           `Delivery boy nikal raha hai. Thodi der mein aap ke paas hoga!\n` +
           `Ghar par ready rahein, please! 😊`;
  },

  statusDelivered: (orderId) =>
    `✅ Aap ka order *${orderId}* deliver ho gaya!\n\n` +
    `Khana kaisa laga? Humari service kaisi rahi?\n` +
    `Aap ka feedback hamare liye ahem hai! 🙏\n\n` +
    `Dobara order karne k liye *menu* likhein! 😊`,

  statusCancelled: (orderId, reason) =>
    `❌ Bhai, order *${orderId}* cancel karna para.\n\n` +
    (reason ? `Waja: ${reason}\n\n` : '') +
    `Maaf kijeye ga, koi masla tha.\n\n` +
    `Dobara try karein, *menu* likh kar! 🙏`,

  // ==================== LAST ORDER STATUS ====================
  
  lastOrderStatus: (order) => {
    const statusMap = {
      'new': '🟡 Mil gaya - confirmation pending',
      'confirmed': '✅ Confirm ho gaya',
      'preparing': '👨‍🍳 Ban raha hai',
      'ready': '🔔 Ready hai!',
      'delivered': '✅ Deliver ho gaya',
      'cancelled': '❌ Cancel ho gaya'
    };
    let msg = `Aap ka Last Order 📋\n\n`;
    msg += `Order ID: ${order.id}\n`;
    msg += `Status: ${statusMap[order.status] || order.status}\n`;
    msg += `Total: Rs. ${order.total}\n`;
    msg += `Date: ${new Date(order.created_at).toLocaleString()}`;
    
    if (order.status === 'delivered') {
      msg += `\n\nKhana kaisa laga? Dobara order k liye *menu* likhein! 😊`;
    }
    return msg;
  },

  noOrders: () =>
    `Aap ka koi order abhi tak nahi hai.\n\n` +
    `Naya order karne k liye *order* likhein! 😊`,

  // ==================== NATURAL LANGUAGE / SMALL TALK ====================
  
  smallTalk: {
    // Greetings variations
    greetings: [
      'Wa alaikum assalam! 🌟 Kya khilaoon aap ko?',
      'Assalam o Alaikum! 😊 Bataiye kya order karna hai?',
      'Aray hello! Khush aamdeed! 🙏 Kaise help karoon?',
      'Adab! 🌟 Bataiye, kuch order karna hai?'
    ],
    
    // How are you
    howAreYou: [
      'Alhamdulillah, bilkul theek hoon! Aap sunayein? 😊',
      'Bas aap ki dua se! Aap kaise hain? 🌟',
      'Theek hoon bhai! Aap bataiye, kya khana hai? 😄'
    ],
    
    // Thanks variations (when customer says thanks)
    thanks: [
      'Aray nahi nahi, thank you toh aap ka! 😊',
      'Aap ka aana hamari khushi hai! 🙏',
      'Koi baat nahi bhai, hamesha welcome! 😄',
      'Pakka! Aur kuch chahiye toh bata dena! 👍'
    ],
    
    // Goodbye
    goodbye: [
      'Allah hafiz! 🌙 Aur kuch chahiye toh aana.',
      'Khuda hafiz! Phir milte hain! 👋',
      'Allah hafiz! Khush rehein! 🌟',
      'Take care! Dobara aana! 😊'
    ],
    
    // Yes/OK
    yesOk: [
      'Pakka! Bataiye. 😊',
      'Ok bhai! Kya karna hai?',
      'Theek hai! Aage bataiye. 👍'
    ],
    
    // Bot identity questions
    whoAreYou: (restaurantName) =>
      `Main ${restaurantName} k yahan ka assistant hoon! 🤖\n\n` +
      `Aap ka khana order karne mein madad karta hoon. ` +
      `Menu se item choose karwaya, order place karwaya, ` +
      `aur status bhi bata sakta hoon.\n\n` +
      `Bas bata dijiye kya chahiye! 😊`,
    
    // Human or bot
    areYouBot: (restaurantName) =>
      `Main ${restaurantName} ka assistant hoon! 🌟\n\n` +
      `Aap k order aur sawalat ka jawaab deta hoon. ` +
      `Lekin har sawal ka jawaab human jaisa hi deta hoon! 😊\n\n` +
      `Bataiye kya khilaoon aap ko?`,
    
    // Compliments
    compliment: [
      'Aray shukriya! 🙏 Aap ka khana acha lagega, pakka!',
      'Thank you! Aap ki khidmat hamari zimedari hai! 😊',
      'Aap ne dil khush kar diya! 🌟 Bas order kar dein!'
    ],
    
    // When customer is hungry
    hungry: () =>
      `Aray bhook lagi toh sahi jagah aaye! 😄\n\n` +
      `*menu* likhein, dekhein kya kya hai. ` +
      `Ya seedha *order* likhein aur bata dijiye kya khana hai!`,
    
    // When customer asks what's good
    whatsGood: () =>
      `Sab kuch acha hai bhai, but hamari specialities: ⭐\n\n` +
      `👉 Chicken Biryani (best seller!)\n` +
      `👉 Zinger Burger\n` +
      `👉 Chicken Tikka Pizza\n` +
      `👉 Seekh Kebab\n\n` +
      `*menu* likh kar poora menu dekh lein! 😊`,
    
    // When customer asks about specific dish
    dishInfo: (item) =>
      `${item.name} - Rs. ${item.price} 💰\n\n` +
      `${item.description || 'Yeh hamara special item hai, bohat pasand kiya jata hai!'}\n\n` +
      `Order karne k liye "${item.name}" likh dein! 😊`,
    
    // When customer asks about price
    priceQuery: (item) =>
      `${item.name} ki qeemat Rs. ${item.price} hai.\n\n` +
      `Order k liye "${item.name}" likhein! 😊`,
    
    // When customer asks about delivery
    deliveryQuery: () =>
      `Haan delivery hoti hai! 🛵\n\n` +
      `Delivery charges:\n` +
      `• 3-5 km: Rs. 100\n` +
      `• 5-8 km: Rs. 150\n` +
      `• 8-12 km: Rs. 200\n\n` +
      `30-45 min mein pohanch jata hai! 😊`,
    
    // When customer asks about timing
    timingQuery: () =>
      `Hum subah 11 baje se raat 11 baje tak khule rehte hain. ⏰\n\n` +
      `Monday - Sunday, har roz! 😊`,
    
    // When customer asks about payment
    paymentQuery: () =>
      `Payment k liye yeh options hain: 💳\n\n` +
      `• Cash on Delivery\n` +
      `• EasyPaisa / JazzCash\n` +
      `• Bank Transfer\n\n` +
      `Order k time bata dijiye, hum arrange kar denge! 😊`,
    
    // When customer asks about location
    locationQuery: (restaurantName, address) =>
      `${restaurantName} ka address: 📍\n\n` +
      `${address || 'Restaurant se direct rabta karein.'}\n\n` +
      `Google Maps par search kar lijiye ga!`,
    
    // Default when bot doesn't understand
    didntUnderstand: () => {
      const replies = [
        `Maaf kijeye ga, samajh nahi aaya. 😅\n\n*menu*, *order*, *status*, ya *help* likhein.`,
        `Hmm, yeh thora confusing hai. 🤔\n\n*help* likhein toh sab commands mil jayenge.`,
        `Aray, yeh kya? Samajh nahi aaya. 😅\n\n*menu* likh kar menu dekhein, ya *order* karein!`,
        `Sorry bhai, nahi samajh aaya. 🙏\n\n*menu*, *order*, *status* - kuch bhi likhein!`
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    },
    
    // Empty message
    emptyMessage: () =>
      `Aray kuch toh likhein! 😄\n\n*menu*, *order*, *status*, ya *help* likhein.`,
    
    // When customer uses emoji only
    emojiOnly: () =>
      `😄 \n\nBas yeh? Kuch order karna hai toh *menu* likhein!`,
    
    // When customer takes long to respond
    stillThere: () =>
      `Aap abhi tak hain? 😊\n\nKuch order karna ho toh bataiye!`,
    
    // Suggestion after no activity
    suggestion: () =>
      `Bhai, menu dekh lein! 😊\n\n*menu* likhein, bohat kuch hai khane ko!`
  },

  // ==================== ERROR HANDLING ====================
  
  somethingWrong: () =>
    `Uff, kuch masla ho gaya. 😅\n\n` +
    `Dobara koshish karein. Madad k liye *help* likhein.`,

  invalidChoice: () =>
    `Hmm, samajh nahi aaya. 😅\n\n` +
    `*menu*, *order*, *status*, ya *help* likhein.`,

  timeout: () =>
    `Aray, aap 30 min se silence! 😄\n\n` +
    `Order session khatam ho gaya. ` +
    `Naya order k liye *order* likhein!`,

  // ==================== RECOMMENDATIONS ====================
  
  recommendItems: (items) => {
    let msg = `Aap ko yeh pasand aa sakta hai: ⭐\n\n`;
    items.forEach((item, i) => {
      msg += `${i + 1}. ${item.name} - Rs. ${item.price}\n`;
      if (item.description) {
        msg += `   _${item.description}_\n`;
      }
    });
    msg += `\nOrder k liye item ka naam likhein! 😊`;
    return msg;
  },

  // ==================== TYPING INDICATOR MESSAGES ====================
  
  // Quick acknowledgments before main response
  typingAck: () => {
    const acks = [
      'Ek second...',
      'Hmm, dekhta hoon...',
      'Bilkul, ek minute...',
      'Pakka, abhi bata hoon...'
    ];
    return acks[Math.floor(Math.random() * acks.length)];
  }
};

module.exports = responses;
