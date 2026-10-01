# Frontend STEEL ONE — build Vite rồi phục vụ bằng nginx (proxy /api, /uploads sang backend)
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Bản production ẩn nút đăng nhập nhanh demo (đặt VITE_DEMO_LOGIN=1 khi build bản demo cho khách)
ARG VITE_DEMO_LOGIN=0
ENV VITE_DEMO_LOGIN=$VITE_DEMO_LOGIN
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
