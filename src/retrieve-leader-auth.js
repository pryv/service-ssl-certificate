const yaml = require('yamljs');
const request = require('superagent');
const fs = require('fs');

exports.getLeaderAuth = async () => {
  try {
    const platformConfig = yaml.load('/app/conf/platform.yml');
    const domain = platformConfig.vars.MACHINES_AND_PLATFORM_SETTINGS.settings.DOMAIN.value
    const baseUrl = `https://lead.${domain}`;
    const username = 'initial_user';

    let password;
    if (fs.existsSync('/app/credentials/credentials.txt')) {
      password = fs.readFileSync('/app/credentials/credentials.txt').toString().trim();
    } else {
      throw new Error('Initial user password was not found!');
    }
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
