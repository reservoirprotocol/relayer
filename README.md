# Relayer

Service for monitoring/indexing orders from various marketplaces (eg. OpenSea, LooksRare).

### Setup

In order to run the service, you'll need a Postgres and Redis instance. For running locally, these are conveniently provided via `docker-compose`. Boot them up by running `docker-compose up` in the root directory.

Install dependencies via `yarn`. Build and start the service via `yarn build` and `yarn start`. Make sure to have a `.env` file in the root directory containing the environment variables needed by [`config.ts`](./src/config.ts) (you can also use the defaults available in `.env.mainnet` and `.env.rinkeby`).

### Deployment and workflow

Deployment is done via [`railway.app`](https://railway.app/) and depends on the `Dockerfile` in the root directory. All changes should first be done against the `dev` branch (which will trigger a deployment on the staging environment) and then merged against the `main` branch (which will trigger a deployment on the production environment).
