FROM node:16.13-slim

ARG DATABASE_URL

WORKDIR /opensea-indexer
ADD . /opensea-indexer
RUN yarn install --frozen-lockfile --production
RUN yarn build
CMD yarn start