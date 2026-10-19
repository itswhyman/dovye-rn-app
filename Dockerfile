# 1. Aşama: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npx expo export --platform web || npx expo export:web

# 2. Aşama: Nginx ile Yayınlama
FROM nginx:alpine

# Healthcheck için curl paketini yükle
RUN apk add --no-cache curl

COPY --from=builder /app/dist /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]