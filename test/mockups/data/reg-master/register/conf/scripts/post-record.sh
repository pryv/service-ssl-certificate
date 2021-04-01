#!/bin/bash
REG_URL="http://pryvio_dns:9000"
REG_ADMIN_KEY="REGISTER_ADMIN_KEY_1"

CERTBOT_VALIDATION=$1
if [ -z "$CERTBOT_VALIDATION" ]
then
      echo "Error : CERTBOT_VALIDATION is empty, please run 'renew-certif.sh' and not this script directly"
      exit 1
fi

# https://askubuntu.com/questions/1070864/how-to-set-variable-in-the-curl-command-in-bash
printf -v data '{"_acme-challenge": {"description": "%s"}}' "$CERTBOT_VALIDATION"
printf -v auth 'Authorization: %s' "$REG_ADMIN_KEY"
printf -v url '%s' "$REG_URL/records"

curl -d "$data" \
        -H "Content-Type: application/json" \
        -H "$auth" \
        -X POST "$url"

# Sleep to make sure the change has time to propagate over to DNS
SLEEP=10
echo "sleep $SLEEP"
sleep $SLEEP
