FROM node:16.20.2-bookworm AS builder

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

FROM node:16.20.2-bookworm-slim AS runner

ENV NODE_ENV=production
WORKDIR /misskey

RUN corepack enable pnpm

RUN apt-get update
RUN apt-get install -y ffmpeg wget

COPY --from=builder /misskey/node_modules ./node_modules
COPY --from=builder /misskey/built ./built
COPY . ./

CMD ["pnpm", "run", "migrateandstart"]
