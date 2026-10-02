FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3333 5173
CMD ["node", "ace", "serve", "--hmr"]
