FROM node:20

WORKDIR /app

COPY ../package*.json ./
COPY ../hardhat.config.ts ./
COPY ../tsconfig.json ./

COPY ../scripts ./scripts
COPY ../contracts ./contracts

COPY ../.env ./

RUN npm install

EXPOSE 8545