FROM node:24-alpine

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY server/package.json ./server/
RUN pnpm install --frozen-lockfile --filter server...

COPY server ./server
RUN pnpm --filter server build

WORKDIR /app/server
EXPOSE 3001
CMD ["node", "dist/index.js"]
