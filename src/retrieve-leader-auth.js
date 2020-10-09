const yaml = require('yamljs');
const request = require('superagent');

exports.getLeaderAuth = async () => {
    try {
        const platformPath = '/app/conf/platform.yml';
        const platformConfig = yaml.load(platformPath);
        const domain = platformConfig.vars.MACHINES_AND_PLATFORM_SETTINGS.settings.DOMAIN.value
        const baseUrl = `https://lead.${domain}`;//'http://0.0.0.0:7000';
        const username = 'initial_user';
        const password = process.env.LEADER_CREDENTIALS.trim();
        return await requestToken(baseUrl, username, password);
    } catch (err) {
        console.error(err);
    }
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
