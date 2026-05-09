FROM node:20.9-alpine AS builder
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY pnpm-workspace.yaml package.json ./
COPY tooling ./tooling
COPY packages ./packages

RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @agentronics/gateway... build

FROM node:20.9-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /workspace/packages/gateway/dist ./dist
COPY --from=builder /workspace/packages/gateway/package.json ./package.json
COPY --from=builder /workspace/node_modules ./node_modules

EXPOSE 8787
CMD ["node", "dist/server.js"]
