FROM node:14

COPY ./src/. /app/

RUN apt-get update -y \
    && apt-get install -y certbot jq dnsutils \
    && npm install

RUN chmod +x src/pre-renew-certificate.js

CMD tail -f /dev/null
#ENTRYPOINT ["node", "renew-certificate.js"]
