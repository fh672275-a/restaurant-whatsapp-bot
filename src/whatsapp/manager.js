/**
 * WhatsApp Multi-Session Manager (Simplified & Stable)
 * 
 * Manages multiple WhatsApp connections using Baileys library.
 * - One-time QR scan per restaurant
 * - Sessions persist to disk
 * - Auto-reconnect on disconnect
 * - Real-time QR code updates via Socket.io
 */

const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Active sessions
const sessions = new Map();
// Pending QR codes
const pendingQrCodes = new Map();
// Socket.io instance
let io = null;

function setSocketIO(socketIO) {
  io = socketIO;
}

/**
 * Simple logger to avoid pino worker thread issues
 */
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

/**
 * Get session auth folder path
 */
function getSessionPath(restaurantId) {
  const safeId = String(restaurantId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(config.WHATSAPP_SESSIONS_DIR, safeId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Lazy load bot handler to avoid circular dependency
 */
let botHandler = null;
function getBotHandler() {
  if (!botHandler) {
    botHandler = require('../bot/handler');
  }
  return botHandler;
}

/**
 * Start a WhatsApp session for a restaurant
 */
async function startSession(restaurantId) {
  // Normalize ID
  restaurantId = String(restaurantId);

  // Check existing session
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
    reconnectAttempts: 0
  };
  sessions.set(restaurantId, sessionObj);

  try {
    const sessionDir = getSessionPath(restaurantId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: simpleLogger,
      browser: Browsers.macOS('Desktop'),
      connectTimeoutMs: 30000,
      defaultQueryTimeoutMs: 30000,
      keepAliveIntervalMs: 60000,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      emitOwnEvents: false
    });

    sessionObj.socket = sock;

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

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
        const handler = getBotHandler();
        await handler.handleMessage(sock, m, restaurantId);
      } catch (e) {
        console.error('[WA] Message handling error:', e.message);
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
 * Clear session (delete auth files)
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
 * Disconnect a restaurant's WhatsApp session
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
 * Send a text message from a restaurant's WhatsApp
 */
async function sendMessage(restaurantId, to, text) {
  restaurantId = String(restaurantId);
  const session = sessions.get(restaurantId);
  if (!session || !session.socket) {
    throw new Error('WhatsApp not connected');
  }
  let jid = String(to).replace(/[^0-9]/g, '');
  if (!jid.endsWith('@s.whatsapp.net')) {
    jid = jid + '@s.whatsapp.net';
  }
  const result = await session.socket.sendMessage(jid, { text });
  return result;
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
          await new Promise(resolve => setTimeout(resolve, 2000));
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
