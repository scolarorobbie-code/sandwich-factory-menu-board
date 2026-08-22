FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
RUN npm ci --workspace @wisteria/server --include-workspace-root
COPY server/ server/
RUN npm run build --workspace @wisteria/server

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY server/package.json server/
RUN npm ci --workspace @wisteria/server --include-workspace-root --omit=dev
COPY --from=build /app/server/dist server/dist
COPY server/migrations server/migrations
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
