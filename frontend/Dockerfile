FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_API_URL=/api
ARG VITE_WS_URL=/ws
ARG VITE_VAPID_PUBLIC_KEY
ARG VITE_ADMIN_USERNAMES
ARG VITE_APP_URL

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
ENV VITE_ADMIN_USERNAMES=$VITE_ADMIN_USERNAMES
ENV VITE_APP_URL=$VITE_APP_URL

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx-frontend.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
