FROM node:24-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data
RUN mkdir -p /app /data && chown -R node:node /app /data
COPY --from=build --chown=node:node /app/package*.json /app/
RUN npm ci --omit=dev
COPY --from=build --chown=node:node /app/server /app/server
COPY --from=build --chown=node:node /app/shared /app/shared
COPY --from=build --chown=node:node /app/dist /app/dist
USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "server/index.mjs"]
