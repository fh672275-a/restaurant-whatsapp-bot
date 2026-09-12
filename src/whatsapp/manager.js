/**
 * WhatsApp Multi-Session Manager (v2 - Fixed)
 * 
 * Fixes "Waiting for this message" issue by:
 * 1. Using latest Baileys 7
 * 2. Proper pre-key sync via makeCacheableSignalKeyStore
 * 3. getMessage callback for retry requests
 * 4. Warm-up routine after connection
 * 5. Proper retry on message send failures
 */

const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  delay,
  proto
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const sessions = new Map();
const pendingQrCodes = new Map();
let io = null;

function setSocketIO(socketIO) {
  io = socketIO;
}

// Simple logger (silent to keep console clean)
const simpleLogger = {
  level: 'silent',
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  trace: () => {},
  child: function() { return this; }
};

function getSessionPath(restaurantId) {
  const safeId = String(restaurantId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(config.WHATSAPP_SESSIONS_DIR, safeId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

let botHandler = null;
function getBotHandler() {
  if (!botHandler) {
    botHandler = require('../bot/handler');
  }
  return botHandler;
}

/**
 * Store messages for retry requests (when customer asks for previous message)
 */
const messageStore = new Map(); // jid -> [messages]

function storeMessage(jid, msg) {
  if (!messageStore.has(jid)) {
    messageStore.set(jid, []);
  }
  const arr = messageStore.get(jid);
  arr.push(msg);
  if (arr.length > 50) arr.shift();
}

/**
 * Start a WhatsApp session with proper fixes
 */
async function startSession(restaurantId) {
  restaurantId = String(restaurantId);

  if (sessions.has(restaurantId)) {
    const existing = sessions.get(restaurantId);
    if (existing.socket && existing.status === 'connected') {
      return { status: 'connected', phone: existing.phone };
    }
    if (existing.status === 'connecting' || existing.status === 'qr_ready') {
      return { status: existing.status };
    }
  }

  let sessionObj = {
    socket: null,
    restaurantId,
    status: 'connecting',
    phone: null,
    lastDisconnect: null,
    reconnectAttempts: 0,
    warmupDone: false
  };
  sessions.set(restaurantId, sessionObj);

  try {
    const sessionDir = getSessionPath(restaurantId);
    const { state, saveCreds, saveState } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    // Create socket with all proper options
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, simpleLogger)
      },
      printQRInTerminal: false,
      logger: simpleLogger,
      browser: Browsers.macOS('Desktop'),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      emitOwnEvents: false,
      // Important: getMessage for retry requests (fixes "Waiting for message")
      getMessage: async (key) => {
        try {
          const jid = key.remoteJid;
          if (messageStore.has(jid)) {
            const msgs = messageStore.get(jid);
            const found = msgs.find(m => m.key.id === key.id);
            if (found) return found.message;
          }
          // Return a placeholder message
          return proto.Message.fromObject({ conversation: '...' });
        } catch (e) {
          return proto.Message.fromObject({ conversation: '...' });
        }
      },
      // Custom retry logic
      retryRequestDelayMs: 250,
      // Set mobile flag to false (we're desktop)
      customUploadHosts: []
    });

    sessionObj.socket = sock;

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;

      if (qr) {
        pendingQrCodes.set(restaurantId, qr);
        sessionObj.status = 'qr_ready';
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { width: 400, margin: 2 });
          if (io) {
            io.emit(`whatsapp:qr:${restaurantId}`, { qr, qrDataUrl });
          }
          console.log(`[WA] QR generated for restaurant ${restaurantId}`);
        } catch (e) {
          console.error('[WA] QR generation error:', e.message);
        }
      }

      if (connection === 'open') {
        sessionObj.status = 'connected';
        sessionObj.phone = sock.user ? String(sock.user.id || '').split(':')[0] : null;
        pendingQrCodes.delete(restaurantId);
        
        try {
          const { db } = require('../db');
          db.prepare('UPDATE restaurants SET whatsapp_connected = 1, whatsapp_phone = ? WHERE id = ?')
            .run(sessionObj.phone, restaurantId);
        } catch (e) {
          console.error('[WA] DB update error:', e.message);
        }
        
        if (io) {
          io.emit(`whatsapp:connected:${restaurantId}`, { phone: sessionObj.phone });
        }
        console.log(`[WA] Restaurant ${restaurantId} connected as ${sessionObj.phone}`);
        
        // Warm-up: Wait for history sync, then mark as ready
        setTimeout(async () => {
          await performWarmup(sock, restaurantId, sessionObj);
        }, 5000);
      }

      if (connection === 'close') {
        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
        sessionObj.status = 'disconnected';
        sessionObj.lastDisconnect = lastDisconnect;
        
        if (io) {
          io.emit(`whatsapp:disconnected:${restaurantId}`, { statusCode });
        }

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect && sessionObj.reconnectAttempts < 5) {
          sessionObj.reconnectAttempts++;
          const delay = Math.min(3000 * sessionObj.reconnectAttempts, 15000);
          console.log(`[WA] Restaurant ${restaurantId} reconnecting in ${delay}ms (attempt ${sessionObj.reconnectAttempts}, code ${statusCode})`);
          setTimeout(() => startSession(restaurantId), delay);
        } else if (statusCode === DisconnectReason.loggedOut) {
          console.log(`[WA] Restaurant ${restaurantId} logged out. Clearing session.`);
          clearSession(restaurantId);
        } else {
          console.log(`[WA] Restaurant ${restaurantId} max reconnect attempts reached.`);
        }
      }
    });

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
      try {
        console.log('[WA] messages.upsert received for restaurant:', restaurantId);
        console.log('[WA] Type:', m.type, 'Messages count:', m.messages ? m.messages.length : 0);
        
        if (m.messages && m.messages.length > 0) {
          for (const msg of m.messages) {
            if (msg.key && msg.key.remoteJid && msg.message) {
              const fromMe = msg.key.fromMe ? 'YES' : 'NO';
              const jid = msg.key.remoteJid;
              const msgType = Object.keys(msg.message || {})[0];
              console.log(`[WA] Message from JID: ${jid} | FromMe: ${fromMe} | Type: ${msgType}`);
              storeMessage(jid, msg);
            }
          }
        }
        
        // Only process if it's a notification (new message) - NOT history sync
        if (m.type === 'notify' && m.messages && m.messages.length > 0) {
          const handler = getBotHandler();
          await handler.handleMessage(sock, m, restaurantId);
        } else if (m.type === 'append') {
          // Also handle append type (messages from another device)
          console.log('[WA] Append type message, processing...');
          const handler = getBotHandler();
          await handler.handleMessage(sock, m, restaurantId);
        } else {
          console.log('[WA] Skipping message type:', m.type);
        }
      } catch (e) {
        console.error('[WA] Message handling error:', e.message);
        console.error(e.stack);
      }
    });

    // Also listen for messages.update (status changes, etc.)
    sock.ev.on('messages.update', (updates) => {
      try {
        for (const update of updates) {
          if (update.key && update.key.remoteJid && !update.key.fromMe) {
            console.log('[WA] Message update from:', update.key.remoteJid, 'Status:', update.update?.status);
          }
        }
      } catch (e) {}
    });

    // Handle message receipt updates (delivery/read)
    sock.ev.on('message-receipt.update', (updates) => {
      // Optional: track delivery status
    });

    // Handle history sync (important for new connections)
    sock.ev.on('messaging-history.set', ({ chats, contacts, messages, isLatest }) => {
      if (isLatest) {
        console.log(`[WA] History sync: ${chats.length} chats, ${contacts.length} contacts, ${messages.length} messages`);
      }
    });

    return { status: 'connecting' };
  } catch (error) {
    console.error('[WA] Failed to start session:', error.message);
    sessionObj.status = 'error';
    return { status: 'error', error: error.message };
  }
}

/**
 * Perform warmup routine after connection
 * This helps fix "Waiting for message" issues
 */
async function performWarmup(sock, restaurantId, sessionObj) {
  try {
    console.log(`[WA] Performing warmup for ${restaurantId}...`);
    
    // Wait for full sync
    await delay(3000);
    
    // Send presence update (online)
    if (typeof sock.sendPresenceUpdate === 'function') {
      try {
        await sock.sendPresenceUpdate('available');
        console.log('[WA] Presence: available');
      } catch (e) {
        // ignore
      }
    }
    
    sessionObj.warmupDone = true;
    console.log(`[WA] Warmup complete for ${restaurantId}`);
  } catch (e) {
    console.error('[WA] Warmup error:', e.message);
  }
}

/**
 * Clear session
 */
async function clearSession(restaurantId) {
  restaurantId = String(restaurantId);
  const session = sessions.get(restaurantId);
  if (session && session.socket) {
    try {
      session.socket.ev.removeAllListeners();
      if (typeof session.socket.end === 'function') {
        session.socket.end();
      }
    } catch (e) {
      // ignore
    }
  }
  sessions.delete(restaurantId);
  pendingQrCodes.delete(restaurantId);
  
  const dir = getSessionPath(restaurantId);
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.error('[WA] Failed to remove session files:', e.message);
    }
  }
  
  try {
    const { db } = require('../db');
    db.prepare('UPDATE restaurants SET whatsapp_connected = 0, whatsapp_phone = NULL WHERE id = ?')
      .run(restaurantId);
  } catch (e) {
    // ignore
  }
}

/**
 * Disconnect a session
 */
async function disconnectSession(restaurantId) {
  restaurantId = String(restaurantId);
  const session = sessions.get(restaurantId);
  if (session && session.socket) {
    try {
      if (typeof session.socket.logout === 'function') {
        await session.socket.logout();
      } else if (typeof session.socket.end === 'function') {
        session.socket.end();
      }
    } catch (e) {
      // ignore
    }
  }
  await clearSession(restaurantId);
}

/**
 * Get session status
 */
function getSessionStatus(restaurantId) {
  restaurantId = String(restaurantId);
  const session = sessions.get(restaurantId);
  if (!session) {
    return { status: 'disconnected', phone: null };
  }
  return {
    status: session.status,
    phone: session.phone,
    lastDisconnect: session.lastDisconnect
  };
}

/**
 * Send a text message with retry logic
 * This is the main fix for "empty messages" - properly format and retry
 */
async function sendMessage(restaurantId, to, text, options = {}) {
  restaurantId = String(restaurantId);
  const session = sessions.get(restaurantId);
  if (!session || !session.socket) {
    throw new Error('WhatsApp not connected');
  }
  
  let jid = String(to).replace(/[^0-9]/g, '');
  if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@g.us')) {
    jid = jid + '@s.whatsapp.net';
  }
  
  // Try sending with retry
  let attempts = 0;
  let lastError = null;
  
  while (attempts < 3) {
    try {
      attempts++;
      
      // Send presence update (typing) before message
      if (typeof session.socket.sendPresenceUpdate === 'function') {
        try {
          await session.socket.sendPresenceUpdate('available', jid);
        } catch (e) {
          // ignore
        }
      }
      
      const messageContent = {
        text: text,
        // Optional: link preview
        linkPreview: options.linkPreview !== false
      };
      
      const result = await session.socket.sendMessage(jid, messageContent, {
        // Use a unique message ID
        messageId: options.messageId,
        // Optional: quoted message
        quoted: options.quoted,
        // Timing
        timeoutMs: 30000
      });
      
      // Store the sent message for retry requests
      if (result && result.key) {
        const fakeMsg = {
          key: result.key,
          message: { conversation: text }
        };
        storeMessage(jid, fakeMsg);
      }
      
      return result;
    } catch (e) {
      lastError = e;
      console.error(`[WA] Send attempt ${attempts} failed:`, e.message);
      
      // Wait before retry
      if (attempts < 3) {
        await delay(1000 * attempts);
      }
    }
  }
  
  throw lastError || new Error('Send failed');
}

/**
 * Initialize all connected restaurants on server start
 */
async function initializeConnectedRestaurants() {
  try {
    const { db } = require('../db');
    const restaurants = db.prepare('SELECT id FROM restaurants WHERE whatsapp_connected = 1').all();
    console.log(`[WA] Found ${restaurants.length} connected restaurants, restoring sessions...`);
    
    for (const r of restaurants) {
      const sessionPath = getSessionPath(r.id);
      if (fs.existsSync(sessionPath)) {
        try {
          await startSession(r.id);
          await delay(2000);
        } catch (e) {
          console.error(`[WA] Failed to restore session for ${r.id}:`, e.message);
        }
      } else {
        db.prepare('UPDATE restaurants SET whatsapp_connected = 0, whatsapp_phone = NULL WHERE id = ?').run(r.id);
      }
    }
  } catch (e) {
    console.error('[WA] Initialize error:', e.message);
  }
}

module.exports = {
  startSession,
  disconnectSession,
  clearSession,
  getSessionStatus,
  sendMessage,
  initializeConnectedRestaurants,
  setSocketIO,
  sessions
};
