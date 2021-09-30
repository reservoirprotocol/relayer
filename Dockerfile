FROM node:15.14-slim

ARG DATABASE_URL

WORKDIR /opensea-indexer
ADD . /opensea-indexer
RUN apt-get -qy update && apt-get -qy install openssl
RUN yarn install
RUN yarn build
CMD yarn start