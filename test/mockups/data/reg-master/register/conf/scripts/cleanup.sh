#!/bin/bash
LEAD_URL="https://lead.DOMAIN"
LEAD_ADMIN_KEY="LEADER_ADMIN_KEY"

#########################
# Check if certificates generation was successfull
#########################
function fileExists() {
        FILE=$1
        for f in $FILE; do
                [ -e "$f" ] && return 0 || echo "files do not exist"
        done
        return 1
}

pushd /etc/letsencrypt/live/DOMAIN/
FULLCHAIN_FILE="./fullchain.pem"
KEY_FILE="./privkey.pem"
if fileExists $FULLCHAIN_FILE && fileExists $KEY_FILE; then
        #########################
        # Concat files to pryv.io standards
        #########################
        DOTED_NAME="DOMAIN"
        DASHED_NAME=`echo "${DOTED_NAME/./-}"`
        cat cert.pem fullchain.pem > $DASHED_NAME-bundle.crt
        cp privkey.pem $DASHED_NAME-key.pem

	#########################
	# Copy certificates to config-leader (reg-master nginx)
	#########################
	cp $DASHED_NAME-* /var/pryv-central/config-leader/data/reg-master/nginx/conf/secret/
	echo "Certificates copied at /var/pryv-central/config-leader/data/reg-master/nginx/conf/secret/"

	#########################
	# Call /notify, it should notify all followers to get the last config and restart pryv
	#########################
        # https://askubuntu.com/questions/1070864/how-to-set-variable-in-the-curl-command-in-bash
        printf -v auth 'Authorization: %s' "$LEAD_ADMIN_KEY"
        printf -v url '%s' "$LEAD_URL/admin/notify"

        echo "Calling notify on $url with auth = $auth"
        curl -H "Content-Type: application/json" \
                -H "$auth" \
                -X POST "$url"

else
	echo "ERROR while copying certificates"
fi
