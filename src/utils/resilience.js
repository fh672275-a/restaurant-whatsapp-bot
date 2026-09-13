/**
 * Connection Resilience Manager
 * 
 * Handles:
 * - WhatsApp auto-reconnect with exponential backoff
 * - Health checks (ping every 30 sec)
 * - Connection state monitoring
 * - Rate limiting for AI API calls
 * - Network error recovery
 * 
 * Designed for 300+ restaurants
 */

const config = require('../config');

class ConnectionManager {
  constructor() {
    this.sessions = new Map();
    this.healthCheckInterval = null;
    this.maxReconnectAttempts = 10;
    this.baseRetryDelay = 2000;
    this.maxRetryDelay = 60000;
  }

  registerSession(restaurantId, socket, onDisconnect) {
    this.sessions.set(restaurantId, {
      socket,
      connectedAt: Date.now(),
      lastHealthCheck: Date.now(),
      reconnectAttempts: 0,
      isHealthy: true,
      onDisconnect
    });
  }

  unregisterSession(restaurantId) {
    this.sessions.delete(restaurantId);
  }

  updateHealth(restaurantId, isHealthy) {
    const session = this.sessions.get(restaurantId);
    if (session) {
      session.isHealthy = isHealthy;
      session.lastHealthCheck = Date.now();
    }
  }

  getRetryDelay(attempt) {
    const delay = this.baseRetryDelay * Math.pow(2, attempt);
    return Math.min(delay, this.maxRetryDelay);
  }

  startHealthCheck() {
    if (this.healthCheckInterval) return;
    this.healthCheckInterval = setInterval(() => {
      this.checkAllSessions();
    }, 30000);
  }

  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  checkAllSessions() {
    for (const [restaurantId, session] of this.sessions) {
      try {
        if (!session.socket || session.socket.user === undefined) {
          const timeSinceLastCheck = Date.now() - session.lastHealthCheck;
          if (timeSinceLastCheck > 60000) {
            console.log(`[Health] Session ${restaurantId} appears dead`);
            session.isHealthy = false;
            if (session.onDisconnect) {
              session.onDisconnect(restaurantId);
            }
          }
        } else {
          session.isHealthy = true;
          session.lastHealthCheck = Date.now();
        }
      } catch (e) {
        console.error(`[Health] Error checking ${restaurantId}:`, e.message);
      }
    }
  }

  getStats() {
    let total = this.sessions.size;
    let healthy = 0;
    let unhealthy = 0;
    for (const session of this.sessions.values()) {
      if (session.isHealthy) healthy++;
      else unhealthy++;
    }
    return { total, healthy, unhealthy };
  }
}

class AIRateLimiter {
  constructor() {
    this.requests = [];
    this.maxRequestsPerMinute = 30;
    this.windowMs = 60000;
  }

  async waitForSlot() {
    const now = Date.now();
    this.requests = this.requests.filter(ts => now - ts < this.windowMs);
    
    if (this.requests.length < this.maxRequestsPerMinute) {
      this.requests.push(now);
      return true;
    }
    
    const oldestRequest = this.requests[0];
    const waitTime = this.windowMs - (now - oldestRequest) + 100;
    console.log(`[AI Rate Limiter] Waiting ${waitTime}ms for slot...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return this.waitForSlot();
  }

  async execute(fn, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.waitForSlot();
        return await fn();
      } catch (e) {
        if (e.message && e.message.includes('429')) {
          console.log(`[AI Rate Limiter] Got 429, attempt ${attempt}/${retries}`);
          await new Promise(r => setTimeout(r, 5000 * attempt));
        } else if (attempt === retries) {
          throw e;
        } else {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
  }
}

class DatabaseLockHandler {
  constructor() {
    this.maxRetries = 5;
    this.baseDelay = 100;
  }

  async executeWithRetry(operation) {
    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return operation();
      } catch (e) {
        lastError = e;
        if (e.code === 'SQLITE_BUSY' || e.message.includes('database is locked')) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          console.log(`[DB Lock] Attempt ${attempt}/${this.maxRetries}, waiting ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          throw e;
        }
      }
    }
    throw lastError;
  }
}

const connectionManager = new ConnectionManager();
const aiRateLimiter = new AIRateLimiter();
const dbLockHandler = new DatabaseLockHandler();

module.exports = {
  connectionManager,
  aiRateLimiter,
  dbLockHandler,
  ConnectionManager,
  AIRateLimiter,
  DatabaseLockHandler
};
