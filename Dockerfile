FROM node:16.13-slim

ARG DATABASE_URL

WORKDIR /opensea-indexer
ADD . /opensea-indexer
RUN yarn install
RUN yarn build
CMD yarn start