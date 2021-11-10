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

RUN yarn install --frozen-lockfile --production=true # equivalent to "npm ci", also ignore devDependencies

# Run the command on container startup
CMD exec chpst -u 9999:9999 NODE_ENV=production node /app/bin/bin/main.js --config /app/conf/ssl-certificate.yml
