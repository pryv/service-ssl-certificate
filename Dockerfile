FROM node:14
MAINTAINER "Tech@Pryv" <tech@pryv.com>

COPY . /app/
WORKDIR /app

RUN apt-get update -y \
    && apt-get install -y certbot dnsutils \
    && npm install

# Make certificate renewal hook executable
RUN chmod +x /app/bin/setDnsChallenge.js

# Run the command on container startup
CMD node /app/bin/main.js
