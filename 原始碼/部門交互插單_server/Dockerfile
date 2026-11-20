# Cloud Run 用。Node 24；以 tsx 直接執行 TypeScript（不另外編譯）。
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY public ./public
ENV NODE_ENV=production
USER node
CMD ["npx", "tsx", "src/server.ts"]
