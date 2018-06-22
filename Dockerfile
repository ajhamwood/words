FROM node:10

MAINTAINER Aidan Hamwood <ajh@tuta.io>

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . ./

CMD ["./app.js"]
