FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache dumb-init su-exec

COPY package*.json ./
RUN npm install --only=production

COPY src/ ./src/

# Create uploads dir; ownership is fixed at runtime by entrypoint.sh because
# Docker named volumes are mounted after build and initially owned by root.
RUN mkdir -p uploads && chown -R node:node /app

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3001

# Entrypoint runs as root to chown the uploads volume, then drops to node.
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "src/index.js"]
