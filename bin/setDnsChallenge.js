#!/usr/bin/node
const fs = require('fs');

const yaml = require('yamljs');

const { setDnsRecord } = require('../src/apiCalls');
const { verifyTextRecord } = require('../src/operations');
const logger = require('../src/logger').getLogger('setDnsChallenge');
const config = require('../src/config');
const platformConfig = require('../src/platformConfig');

(async () => {
  logger.log('info', 'Start LetsEncrypt');
  try {
    
    const domain = platformConfig.get('vars:MACHINES_AND_PLATFORM_SETTINGS:settings:DOMAIN:value');
    const dnsChallenge = process.env.CERTBOT_VALIDATION.toString();
    const subdomain = '_acme-challenge';
    const dnsKey = subdomain + '.' + domain;

    logger.log('info', 'Setting DNS Challenge: ' + dnsChallenge);
    await setDnsRecord({ subdomain: { description: dnsChallenge } });

    const dnsAddressesToCheck = getDnsAddressesToCheck();
    logger.log('info', 'verifying TXT entry in DNS servers at: ' + dnsAddressesToCheck);

    for (let i = 0; i < dnsAddressesToCheck.length; i++) {
      await verifyTextRecord(dnsKey, dnsChallenge, dnsAddressesToCheck[i]);
    }

    logger.log('info', 'End LetsEncrypt');
  } catch (err) {
    logger.log('error', err);
  }
})();

/**
 * Return dns1 and dns2 parameters from dns.json config
 */
function getDnsAddressesToCheck () {
  const dnsSettings = JSON.parse(fs.readFileSync('/app/dns.json')).dns.staticDataInDomain;
  return [dnsSettings.dns1.ip, dnsSettings.dns2.ip].filter(distinct);

  function distinct (value, index, self) {
    return self.indexOf(value) === index;
  }
}
