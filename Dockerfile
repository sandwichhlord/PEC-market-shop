# Production image: Next.js + Socket.IO custom server (server.ts), run with tsx.
# Dev dependencies stay in the image on purpose: the Prisma CLI runs `migrate deploy` (Railway pre-deploy) and
# `db seed`, and tsx runs the server and the seed.
FROM node:24-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall runs `prisma generate`
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads \
    NEXT_TELEMETRY_DISABLED=1 \
    PATH=/app/node_modules/.bin:$PATH
COPY --from=build /app /app
RUN mkdir -p /data/uploads
EXPOSE 3000
# Run tsx directly (not `npm start`) so SIGTERM reaches the server's graceful shutdown.
CMD ["node_modules/.bin/tsx", "server.ts"]
