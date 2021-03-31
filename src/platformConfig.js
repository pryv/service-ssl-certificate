// @flow

const nconf = require('nconf');
const store = new nconf.Provider();

// 1. `process.env`
// 2. `process.argv`
//
store.env().argv();

// 3. Values in `platform.json`
//
const configFile = store.get('platformConfig') || 'platform.yml';
store.file({
  file: configFile,
  format: require('nconf-yaml'),
});

// 4. Any default values
//
store.defaults({
  vars: {
    MACHINES_AND_PLATFORM_SETTINGS: {
      settings: {
        DOMAIN: {
          value: 'pryv.li',
        }
      }
    },
    DNS_SETTINGS: {
      settings: {
        DNS_CUSTOM_ENTRIES: {
          value: {
            smth: 'abc',
          }
        }
      }
    },
    ADVANCED_API_SETTINGS: {
      settings: {
        LETSENCRYPT_EMAIL: {
          value: 'test@pryv.com',
        }
      }
    },
  },
});

module.exports = store;
