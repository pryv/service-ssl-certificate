const fs = require('fs')
const yaml = require('yamljs');
const { execSync } = require('child_process');
const request = require('superagent');

main();
async function main () {
    try {
        const platformPath = '/app/conf/platform.yml';
        const platformConfig = yaml.load(platformPath);
        const domain = platformConfig.vars.MACHINES_AND_PLATFORM_SETTINGS.settings.DOMAIN.value
        const baseUrl = `https://lead.${domain}`;//'http://0.0.0.0:7000';
        const username = 'initial_user';
        const password = process.env.LEADER_CREDENTIALS.trim();
        const privateAddressDns = '172.19.0.1';

        console.log('Start letsencrypt');
        const acme = 'abc';// TODO process.env.CERTBOT_VALIDATION.toString();
        console.log('DELETE THIS LOOOOOOOOOG', acme);
        await writeAcmeChallengeToPlatformYaml(platformConfig, acme, platformPath);
        const token = await requestToken(baseUrl, username, password);
        await notifyAdmin(token, baseUrl);
        await checkDNSAnswer(acme, domain, privateAddressDns);
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
    console.log('Writting acme challenge to platform yaml');
    platformConfig.vars.DNS_SETTINGS.settings.DNS_CUSTOM_ENTRIES.value['_acme-challenge'].description = acme;
    console.log('Write the acme-challenge into the DNS');
    fs.writeFileSync(platformPath, yaml.stringify(platformConfig, 6, 3));
}

async function requestToken (baseUrl, username, password) {
    console.log('Requesting the token');
    const res = await request.post(baseUrl + '/auth/login')
        .send({
            username: username,
            password: password
        });
    return res.body.token;
}

/**
 * Notify admin about new certificate to restart followers that uses the
 * certificates
 * @param {*} token 
 * @param {*} baseUrl
 */
async function notifyAdmin (token, baseUrl) {
    console.log('Notifying admin');
    const servicesToRestart = ['pryvio_config_follower', 'pryvio_dns'];
    const res = await request.post(baseUrl + '/admin/notify')
        .set('Authorization', token)
        .send(servicesToRestart);
    return res.body;
}

/**
 * Verify that acme_challenge succeeded
 * @param {*} acme 
 * @param {*} domain 
 * @param {*} privateAddressDns 
 */
async function checkDNSAnswer (acme, domain, privateAddressDns) {
    console.log('Checking if the DNS answers with the acme-challenge');
    const timeout = 30000;
    let dig_txt = '';
    const startTime = new Date();

    let counter = 0;
    while (dig_txt !== acme && counter < 3) {
        dig_txt = execSync(
            'dig @' + privateAddressDns +
            ' TXT +noall +answer +short _acme-challenge.' + domain)
            .toString()
            .replace(/"/g, '')
            .trim();
        if (dig_txt == acme) {
            counter += 1;
        } else {
            counter = 0;
        }
        let endTime = new Date();
        if (endTime - startTime > timeout) {
            throw new Error('Timeout');
        }
    }
}