FROM node:15.14-slim

WORKDIR /opensea-indexer
ADD . /opensea-indexer
RUN yarn install
RUN yarn build
CMD yarn start