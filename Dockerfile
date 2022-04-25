FROM node:16
MAINTAINER "Tech@Pryv" <tech@pryv.com>

# install dig
RUN apt update
RUN apt install dnsutils --yes
RUN dig -v

ARG TARGET_DIR="/app/bin"
ARG CONF_DIR="/app/conf"
ARG LOG_DIR="/app/log"

RUN mkdir -p $TARGET_DIR
RUN mkdir -p $CONF_DIR
RUN mkdir -p $LOG_DIR

COPY . /app/bin/
WORKDIR /app/bin

RUN npm ci

# Run the command on container startup
CMD NODE_ENV=production node /app/bin/bin/renew --config /app/conf/ssl-certificate.yml

RUN groupmod -g 9999 node && usermod -u 9999 -g 9999 node
USER node
