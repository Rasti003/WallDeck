# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile

COPY apps ./apps
COPY packages ./packages
RUN pnpm build && pnpm install --prod --frozen-lockfile

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=8080
ENV WALLDECK_DATA_PATH=/var/lib/walldeck
ENV PHOTO_STORAGE_PATH=/var/lib/walldeck/photos
WORKDIR /app

RUN groupadd --system --gid 10001 walldeck \
  && useradd --system --uid 10001 --gid walldeck --home-dir /var/lib/walldeck walldeck

COPY --from=build --chown=walldeck:walldeck /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build --chown=walldeck:walldeck /app/node_modules ./node_modules
COPY --from=build --chown=walldeck:walldeck /app/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=walldeck:walldeck /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build --chown=walldeck:walldeck /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=walldeck:walldeck /app/apps/client/dist ./apps/client/dist
COPY --from=build --chown=walldeck:walldeck /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=walldeck:walldeck /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build --chown=walldeck:walldeck /app/packages/contracts/dist ./packages/contracts/dist

USER walldeck
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/settings').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "apps/server/dist/index.js"]
