FROM node:22-bookworm-slim AS build

WORKDIR /workspace
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/prisma.config.ts
RUN npm ci

COPY apps/api apps/api
RUN npm run build:api

FROM build AS production-deps
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=production-deps --chown=node:node /workspace/package.json ./package.json
COPY --from=production-deps --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=production-deps --chown=node:node /workspace/apps/api/prisma ./apps/api/prisma
COPY --from=production-deps --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --from=production-deps --chown=node:node /workspace/node_modules ./node_modules

USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
