FROM node:alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY .env.prod .env
RUN npx prisma generate --schema ./prisma/schema.prisma
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
