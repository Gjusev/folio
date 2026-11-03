# Folio web app (Next.js). Used by: docker compose --profile app up -d --build
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN corepack enable
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
# Apply pending migrations, then serve.
CMD ["sh", "-c", "node scripts/migrate.mts && node_modules/.bin/next start"]
