# Server Dockerfile for Cloud Run — MCP + API
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY tsconfig.json ./
COPY src ./src
COPY schema.json ./schema.json
COPY schema.json ./src/schema.json
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/schema.json ./schema.json
COPY --from=builder /app/schema.json ./dist/schema.json
EXPOSE 8080
CMD ["node", "dist/index.js"]
