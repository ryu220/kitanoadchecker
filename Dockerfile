# ==================================
# Multi-stage Dockerfile for Next.js
# Optimized for Koyeb deployment
# ==================================

# ----------------
# Stage 1: Dependencies
# ----------------
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files from Testproject directory
COPY Testproject/package.json Testproject/package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# ----------------
# Stage 2: Builder
# ----------------
FROM node:18-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY Testproject/ .

# Set environment variable for build
ENV NEXT_TELEMETRY_DISABLED=1

# Install all dependencies (including devDependencies for build)
RUN npm ci

# CRITICAL FIX: Create dummy package for @chroma-core/default-embed
# This optional dependency is not needed but causes build failures
RUN mkdir -p node_modules/@chroma-core/default-embed && \
    echo '{"name":"@chroma-core/default-embed","version":"0.0.0","description":"Dummy package","main":"index.js","type":"commonjs"}' > node_modules/@chroma-core/default-embed/package.json && \
    echo 'module.exports = {};' > node_modules/@chroma-core/default-embed/index.js

# Cache buster: Force rebuild when code changes
ARG CACHEBUST=1

# Build Next.js application
RUN npm run build

# ----------------
# Stage 3: Runner
# ----------------
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application from builder
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/config ./config
COPY --from=builder --chown=nextjs:nodejs /app/knowledge ./knowledge
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/startup.sh ./startup.sh

# CRITICAL FIX: Recreate dummy package for @chroma-core/default-embed in runner stage
# The dummy package from builder stage doesn't get copied with node_modules
RUN mkdir -p node_modules/@chroma-core/default-embed && \
    echo '{"name":"@chroma-core/default-embed","version":"0.0.0","description":"Dummy package","main":"index.js","type":"commonjs"}' > node_modules/@chroma-core/default-embed/package.json && \
    echo 'module.exports = {};' > node_modules/@chroma-core/default-embed/index.js && \
    chown -R nextjs:nodejs node_modules/@chroma-core

# Copy public directory if it exists (create empty dir if not)
RUN mkdir -p ./public

# Make startup script executable
RUN chmod +x ./startup.sh

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application using startup script
CMD ["./startup.sh"]
