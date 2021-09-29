# Opensea Indexer

Service for continuously monitoring/indexing Opensea data (eg. orders, assets).

### Setup

Install dependencies via `yarn`. Build and start the service via `yarn build` and `yarn start`. Make sure to have a `.env` file in the root directory containing the environment variables needed by [`config.ts`](./src/config.ts) (you can also use the defaults available in `.env.mainnet` and `.env.rinkeby`).

### Deployment and workflow

Deployment is done via `railway.app` and depends on the `Dockerfile` in the root directory. All changes should first be done against the `dev` branch (which will trigger a deployment on the staging environment) and then merged against the `main` branch (which will trigger a deployment on the production environment).
