
function isDebugMode () {
  const debug = process.env.DEBUG;
  return debug != null && debug.toString().toLowerCase() === 'true';
}

exports.config = {
  debug: isDebugMode(),
  platformYmlPath: (process.env.PLATFORM_YML) ? process.env.PLATFORM_YML : '/app/conf/platform.yml',
  certMainDir: (process.env.CERT_DIR) ? process.env.CERT_DIR : '/etc/letsencrypt/live',
  waitUntilFollowersReloadMs: (process.env.WAIT_UNTIL_FOLLOWERS_RELOAD_MS) ? process.env.WAIT_UNTIL_FOLLOWERS_RELOAD_MS : 30000,
  followerSettingsFile: (process.env.CONFIG_LEADER_FILEPATH) ? process.env.CONFIG_LEADER_FILEPATH : '/app/conf/config-leader.json',
  credentialsPath: (process.env.INIT_USER_CREDENTIALS) ? process.env.INIT_USER_CREDENTIALS : '/app/credentials/credentials.txt',
};