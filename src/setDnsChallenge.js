#!/usr/bin/node
const fs = require('fs');
const yaml = require('yamljs');
const { execSync } = require('child_process');
const request = require('superagent');
const { notifyAdmin } = require('/app/src/apiCalls');

(async () => {
  console.log('Start letsencrypt');
  try {
    const platformPath = '/app/conf/platform.yml';
    const platformConfig = yaml.load(platformPath);
    const domain = platformConfig.vars.MACHINES_AND_PLATFORM_SETTINGS.settings.DOMAIN.value;
    const baseUrl = `https://lead.${domain}`;
    const dnsChallenge = process.env.CERTBOT_VALIDATION.toString();
    await writeAcmeChallengeToPlatformYaml(platformConfig, dnsChallenge, platformPath);
    await notifyAdmin(baseUrl, ['pryvio_dns']);
    const dnsAddressesToCheck = getDnsAddressesToCheck();
    for (let i = 0; i < dnsAddressesToCheck.length; i++){
      await checkDNSAnswer(dnsChallenge, domain, dnsAddressesToCheck[i]);
    }
    console.log("End letsencrypt");
  } catch (err) {
    console.error(err);
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
  console.log(`Writting acme challenge to ${platformPath}`);
  platformConfig.vars.DNS_SETTINGS.settings.DNS_CUSTOM_ENTRIES.value['_acme-challenge'] = { description: dnsChallenge };
  fs.writeFileSync(platformPath, yaml.stringify(platformConfig, 6, 3));
}

/**
 * Return dns1 and dns2 parameters from dns.json config
 */
function getDnsAddressesToCheck () {
  const dnsSettings = JSON.parse(fs.readFileSync('/app/dns.json')).dns.staticDataInDomain;
  return [dnsSettings.dns1.ip, dnsSettings.dns2.ip].filter(distinct);

  const distinct = (value, index, self) => {
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
  console.log(`Checking if the DNS answers with the acme-challenge`);
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
      throw new Error('Timeout');
    }
  }
}
