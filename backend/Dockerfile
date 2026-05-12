FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache dumb-init

COPY package*.json ./
RUN npm install --only=production

COPY src/ ./src/

# Create uploads dir owned by node so the process can write to it without root
RUN mkdir -p uploads && chown -R node:node /app

USER node

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
