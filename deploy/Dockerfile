FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:selfhost
FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/node_modules/zod ./node_modules/zod
COPY --from=build /app/dist-selfhost ./dist-selfhost
COPY package.json ./
COPY backend ./backend
COPY lib ./lib
COPY mobile/src/model.ts ./mobile/src/model.ts
COPY drizzle ./drizzle
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "--experimental-transform-types", "backend/server.mjs"]
