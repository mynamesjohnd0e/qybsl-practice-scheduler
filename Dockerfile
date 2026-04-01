FROM node:18-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

# Cloud Run injects PORT automatically; default 8080
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
