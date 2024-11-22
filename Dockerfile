FROM node:18.20.5-bookworm AS builder

ENV NODE_ENV=production

WORKDIR /misskey

RUN apt-get update
RUN apt-get install -y build-essential

RUN git init
RUN git submodule update --init
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm
RUN pnpm install --frozen-lockfile
COPY . ./
RUN pnpm build

FROM node:18.20.5-bookworm-slim AS runner

ENV NODE_ENV=production
WORKDIR /misskey

RUN corepack enable pnpm

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
 ffmpeg tini curl libjemalloc-dev libjemalloc2 \
 && ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so \
 && apt-get -y clean \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /misskey/node_modules ./node_modules
COPY --from=builder /misskey/built ./built
COPY . ./

ENV LD_PRELOAD=/usr/local/lib/libjemalloc.so
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "run", "migrateandstart"]
