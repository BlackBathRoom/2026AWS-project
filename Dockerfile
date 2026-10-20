FROM node:18-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY src ./src
COPY tsconfig.json ./tsconfig.json
RUN npm run build
EXPOSE 3000
CMD ["node","dist/src/server.js"]
