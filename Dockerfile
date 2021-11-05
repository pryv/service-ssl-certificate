FROM node:16
MAINTAINER "Tech@Pryv" <tech@pryv.com>

COPY . /app/
WORKDIR /app

RUN yarn install

# Run the command on container startup
CMD NODE_ENV=production node /app/src/renew-certificate.js --config /app/conf/ssl-certificate.yml
