FROM node:22-alpine AS build

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

RUN npm install --global serve@14.2.4

WORKDIR /app
COPY --from=build --chown=node:node /app/out ./out

USER node
EXPOSE 3000
CMD ["serve", "--listen", "3000", "out"]
