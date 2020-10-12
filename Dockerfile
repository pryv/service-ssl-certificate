FROM node:14
MAINTAINER "Tech@Pryv" <tech@pryv.com>

COPY . /app/
WORKDIR /app

RUN apt-get update -y \
    && apt-get install -y certbot dnsutils cron \
    && npm install

COPY cronjob /etc/cron.d/renew-certificate-cronjob
RUN chmod 0644 /etc/cron.d/renew-certificate-cronjob

# Apply cron job
RUN crontab /etc/cron.d/renew-certificate-cronjob

# Make certificate renewal hook executable
RUN chmod +x /app/src/pre-renew-certificate.js

# Create the log file
RUN mkdir -p /app/log/ && touch /app/log/cron.log

# Run the command on container startup
CMD cron -f && tail -f /app/log/cron.log
