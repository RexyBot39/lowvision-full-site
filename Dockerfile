# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage: Node server serves the prerendered site and the /api
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
# The AI assistant, bundled from server/chat/ by `npm run build`
COPY --from=build /app/dist-node ./dist-node
USER node
EXPOSE 3000
CMD ["node", "server/index.mjs"]
