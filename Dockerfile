# 1. Aşama: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Bağımlılık dosyalarını kopyala
COPY package*.json ./

# package-lock.json olmasa dahi paketleri güvenle yükle
RUN npm install --legacy-peer-deps

# Tüm proje dosyalarını kopyala
COPY . .

# Expo Web çıktısını oluştur
RUN npx expo export --platform web || npx expo export:web

# 2. Aşama: Nginx ile Yayınlama
FROM nginx:alpine

# Oluşan statik web dosyalarını Nginx dizinine kopyala
COPY --from=builder /app/dist /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]