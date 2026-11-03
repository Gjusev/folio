# Folio collab relay: Node 24 + ws. Listens only; no network egress needed.
# Same hardening pattern as services/latex-compiler (unprivileged user; the
# compose file adds an internal-only network, read_only and dropped caps).
FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm \
 && pnpm install --frozen-lockfile --prod \
 && pnpm store prune
COPY server.ts ./

USER node
ENV PORT=3001 NODE_ENV=production
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.ts"]
