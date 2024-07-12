FROM node:alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx prisma generate
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
