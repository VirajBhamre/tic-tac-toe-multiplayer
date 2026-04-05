# Build-time VITE_* values are passed as docker compose build args (see root .env).
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_NAKAMA_HOST
ARG VITE_NAKAMA_PORT
ARG VITE_NAKAMA_SERVER_KEY
ARG VITE_NAKAMA_HTTP_KEY
ARG VITE_NAKAMA_USE_SSL
ARG VITE_HOSTING_KEEPALIVE=false

ENV VITE_NAKAMA_HOST=$VITE_NAKAMA_HOST \
    VITE_NAKAMA_PORT=$VITE_NAKAMA_PORT \
    VITE_NAKAMA_SERVER_KEY=$VITE_NAKAMA_SERVER_KEY \
    VITE_NAKAMA_HTTP_KEY=$VITE_NAKAMA_HTTP_KEY \
    VITE_NAKAMA_USE_SSL=$VITE_NAKAMA_USE_SSL \
    VITE_HOSTING_KEEPALIVE=$VITE_HOSTING_KEEPALIVE

RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
