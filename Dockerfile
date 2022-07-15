FROM node:16.13-slim

ARG DATABASE_URL

WORKDIR /relayer
ADD . /relayer
RUN yarn install
RUN yarn build
CMD yarn start