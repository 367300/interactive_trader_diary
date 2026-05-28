FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY patches ./patches
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]
