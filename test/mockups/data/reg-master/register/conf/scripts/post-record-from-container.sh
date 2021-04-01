#!/bin/bash
if [ -z "$CERTBOT_VALIDATION" ]
then
      echo "Error : CERTBOT_VALIDATION is empty, please run 'renew-certif.sh' and not this script directly"
      exit 1
fi

REGISTER_RUNNING=`docker ps --filter name=pryvio_register --filter status=running --quiet`
if [ -z "$REGISTER_RUNNING" ]
then
    echo "Error : Register is not running"
    exit 2
fi

docker exec pryvio_register /app/conf/scripts/post-record.sh $CERTBOT_VALIDATION
