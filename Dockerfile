# 1. Aşama: Node.js ortamında web derlemesi alma (Expo Export)
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx expo export --platform web

# 2. Aşama: Üretilen statik dosyaları Nginx ile sunma
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]