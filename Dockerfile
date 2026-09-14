# Dockerfile for Railway - Stable & Crash-Protected
FROM node:20-slim

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy source code
COPY . .

# Create data directories
RUN mkdir -p /app/data/whatsapp_sessions /app/data/uploads /app/data/payment_screenshots /app/logs

# Expose port
EXPOSE 3000

# Health check - Railway uses this to know if app is alive
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Start command - with crash protection
CMD ["node", "--max-old-space-size=512", "server.js"]
