FROM node:22-alpine
WORKDIR /app
EXPOSE 3000
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
CMD ["npx", "tsx", "src/container/server.ts"]
