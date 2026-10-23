# syntax=docker/dockerfile:1

# -------------------------------------------------------------
# Stage 1: Build the Frontend Client Bundle
# -------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source code and configuration files
COPY index.html vite.config.js ./
COPY public/ ./public/
COPY src/ ./src/

# Compile production bundle to /app/dist
RUN npm run build

# -------------------------------------------------------------
# Stage 2: Minimal Production Runtime
# -------------------------------------------------------------
FROM node:22-alpine AS runner

# Install Python 3 (required for emagram_calc.py aerological calculations)
RUN apk add --no-cache python3 wget

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package descriptors and install production dependencies only
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# Copy backend server code and data assets
COPY server/ ./server/
COPY public/data/ ./public/data/

# Copy compiled frontend distribution from builder stage
COPY --from=builder /app/dist ./dist

# Create runtime cache directory with write permissions for node user
RUN mkdir -p /app/server/cache && chown -R node:node /app

# Run as non-privileged user
USER node

EXPOSE 3000

# Health check against local API endpoint (no external network dependencies)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health > /dev/null || exit 1

CMD ["node", "server/index.js"]
