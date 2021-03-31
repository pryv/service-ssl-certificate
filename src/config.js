// @flow
const fs = require('fs');
const nconf = require('nconf');

// 1. `process.env`
// 2. `process.argv`
//
nconf.env().argv();

// 3. Values in `config.json`
//
let configFile = nconf.get('config');

if (fs.existsSync(configFile)) {
  configFile = fs.realpathSync(configFile);
  console.info('using custom config file: ' + configFile);
} else {
  console.error('Cannot find custom config file: ' + configFile);
}

if (configFile != null) nconf.file({ file: configFile});

// 4. Any default values
//
nconf.defaults({
  debug: false,
  dryRun: true,
  platformYmlPath: '/app/conf/platform.yml',
  waitUntilFollowersReloadMs: 30000,
  letsencrypt: {
    certsDir: '/etc/letsencrypt/live',
    cron: '0 1 * * *',
  },
  leader: {
    url: 'http://pryvio_config_leader:7000/',
    credentialsPath: '/app/credentials/credentials.txt',
    configPath: '/app/conf/config-leader.json',
  },
});

module.exports = nconf;
