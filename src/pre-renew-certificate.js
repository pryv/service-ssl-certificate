#!/usr/bin/node
const fs = require('fs')
const yaml = require('yamljs');
const { execSync } = require('child_process');
const request = require('superagent');
const { getLeaderAuth } = require('./retrieve-leader-auth');

placeAcmeChallenge();
async function placeAcmeChallenge () {
    try {
        const platformPath = '/app/conf/platform.yml';
        const platformConfig = yaml.load(platformPath);
        const domain = platformConfig.vars.MACHINES_AND_PLATFORM_SETTINGS.settings.DOMAIN.value
        const baseUrl = `https://lead.${domain}`;
        console.log('Start letsencrypt');
        const acme = process.env.CERTBOT_VALIDATION.toString();
        await writeAcmeChallengeToPlatformYaml(platformConfig, acme, platformPath);
        await notifyAdmin(baseUrl);
        await checkDNSAnswer(acme, domain);      
        console.log("End letsencrypt");
    } catch (err) {
        console.error(err);
    }
}

/**
 * Save acme challenge to platform yaml 
 * that could be distributed to all followers afterwards
 * @param {*} platformConfig 
 * @param {*} acme 
 * @param {*} platformPath 
 */
async function writeAcmeChallengeToPlatformYaml (platformConfig, acme, platformPath) {
    console.log(`Writting acme challenge to ${platformPath}`);
    platformConfig.vars.DNS_SETTINGS.settings.DNS_CUSTOM_ENTRIES.value['_acme-challenge'].description = acme;
    console.log('Write the acme-challenge into the DNS');
    fs.writeFileSync(platformPath, yaml.stringify(platformConfig, 6, 3));
}

/**
 * Notify admin about new certificate to restart followers that uses the
 * certificates
 * @param {*} token 
 * @param {*} baseUrl
 */
async function notifyAdmin (baseUrl) {
    const token = await getLeaderAuth();
    console.log('Notifying admin');
    const servicesToRestart = ['pryvio_config_follower', 'pryvio_dns'];
    const res = await request.post(baseUrl + '/admin/notify')
        .set('Authorization', token)
        .send(servicesToRestart);
    return res.body;
}

/**
 * Verify that acme_challenge succeeded
 * 
 * @param {*} acme 
 * @param {*} domain 
 * @param {*} privateAddressDns 
 */
async function checkDNSAnswer (acme, domain) {
    console.log(`Checking if the DNS answers with the acme-challenge`);
    const timeout = 30000;
    let dig_txt = '';
    const startTime = new Date();
    while (dig_txt !== acme) {
        dig_txt = execSync(
            `dig TXT +noall +answer +short _acme-challenge.${domain}`)
            .toString()
            .replace(/"/g, '')
            .trim();

        let endTime = new Date();
        if (endTime - startTime > timeout) {
            throw new Error('Timeout');
        }
    }
}
