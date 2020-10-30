# service-ssl-certificate
Pryv.io service for SSL certificate generation and renewal

### Env variables

1) DEBUG - if true - will run certificate check each 5 minutes with dry run option, default false
2) PLATFORM_YML - path to platform yml file, default `/app/conf/platform.yml`
3) CERT_DIR - letsencrypt certificates directory, default `/etc/letsencrypt/live`
4) INIT_USER_CREDENTIALS - path to the file that has admin leader password in it, default `/app/credentials/credentials.txt`
5) CONFIG_LEADER_FILEPATH - path to config leader json config `/app/conf/config-leader.json`
6) WAIT_UNTIL_FOLLOWERS_RELOAD_MS - ms, how long script will wait until checking if the certificates were loaded correctly in the followers, default 30000.
