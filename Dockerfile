# Dockerfile for Railway - Server only (no Electron)
FROM node:20-slim

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install production dependencies only (skip devDependencies like electron)
RUN npm install --omit=dev

# Copy source code
COPY . .

# Create data directory
RUN mkdir -p /app/data/whatsapp_sessions /app/data/uploads

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/login', (r) => process.exit(r.statusCode < 400 ? 0 : 1))" || exit 1

# Start command
CMD ["node", "server.js"]
