FROM node:14.15.1-buster AS builder

ENV NODE_ENV=production

WORKDIR /misskey

RUN apt-get update
RUN apt-get install -y build-essential autoconf automake file g++ gcc libtool nasm pkg-config python zlib1g-dev

RUN git init
RUN git submodule update --init
COPY package.json yarn.lock ./
RUN yarn install
RUN yarn add npm-run-all --dev
COPY . ./
RUN yarn build

FROM node:14.15.1-buster-slim AS runner

ENV NODE_ENV=production
WORKDIR /misskey

RUN npm i -g web-push

RUN apt-get update
RUN apt-get install -y ffmpeg

COPY --from=builder /misskey/node_modules ./node_modules
COPY --from=builder /misskey/built ./built
COPY . ./

CMD ["npm", "run", "migrateandstart"]
