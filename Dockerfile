FROM node:14

RUN apt-get update -y \
    && apt-get install -y certbot jq dnsutils \
    && npm install

COPY . /app/
CMD tail -f /dev/null
#ENTRYPOINT ["node", "renew-certificate.js"]
