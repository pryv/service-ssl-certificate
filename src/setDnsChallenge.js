#!/usr/bin/node
const fs = require('fs');
const yaml = require('yamljs');
const { execSync } = require('child_process');
const { notifyAdmin } = require('/app/src/apiCalls');

const logger = require('./logger').getLogger('setDnsChallenge');

(async () => {
  logger.log('info', 'Start letsencrypt');
  try {
    const platformPath = '/app/conf/platform.yml';
    const platformConfig = yaml.load(platformPath);
    const domain = platformConfig.vars.MACHINES_AND_PLATFORM_SETTINGS.settings.DOMAIN.value;
    const baseUrl = `https://lead.${domain}`;
    const dnsChallenge = process.env.CERTBOT_VALIDATION.toString();
    logger.info('info', 'Setting DNS Challenge: ' + dnsChallenge);
    await writeAcmeChallengeToPlatformYaml(platformConfig, dnsChallenge, platformPath);
    await notifyAdmin(baseUrl, ['pryvio_dns']);
    const dnsAddressesToCheck = getDnsAddressesToCheck();
    logger.log('info', 'verifying TXT entry in DNS servers at: ' + dnsAddressesToCheck);
    for (let i = 0; i < dnsAddressesToCheck.length; i++){
      await checkDNSAnswer(dnsChallenge, domain, dnsAddressesToCheck[i]);
    }
    logger.log('info', 'End letsencrypt');
  } catch (err) {
    logger.log('error', err);
  }
})();

/**
 * Save acme challenge to platform yaml 
 * that could be distributed to all followers afterwards
 * @param {*} platformConfig 
 * @param {*} dnsChallenge 
 * @param {*} platformPath 
 */
async function writeAcmeChallengeToPlatformYaml (platformConfig, dnsChallenge, platformPath) {
  logger.log('info', `Writting acme challenge to ${platformPath}`);
  platformConfig.vars.DNS_SETTINGS.settings.DNS_CUSTOM_ENTRIES.value['_acme-challenge'] = { description: dnsChallenge };
  fs.writeFileSync(platformPath, yaml.stringify(platformConfig, 6, 3));
}

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
/**
 * Verify that acme_challenge success
 * 
 * @param {*} dnsChallenge 
 * @param {*} domain
 */
async function checkDNSAnswer (dnsChallenge, domain, ipToCheck) {
  logger.log('info', `Checking if the DNS answers with the acme-challenge for ` + ipToCheck);
  const timeout = 30000;
  let dig_txt = '';
  const startTime = new Date();
  while (dig_txt !== dnsChallenge) {
    try {
      dig_txt = execSync(`dig @${ipToCheck} TXT +noall +answer +short _acme-challenge.${domain}`)
        .toString()
        .replace(/"/g, '')
        .trim();
    } catch (e) {
      // don't throw an error, if the acme challenge will fail, it should fail with a timeout
    }
    let endTime = new Date();
    if (endTime - startTime > timeout) {
      logger.log('error', 'DNS check timed out');
      throw new Error('Timeout');
    }
    await sleep(1000);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}