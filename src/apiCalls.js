const request = require('superagent');
const fs = require('fs');
const { config } = require('./config');

/**
 * Notify admin about new certificate to restart followers that uses the
 * certificates
 * @param {*} baseUrl
 */
exports.notifyAdmin = async (baseUrl, servicesToRestart) => {
  try {
    const token = await loginLeader(baseUrl);
    console.log('Notifying admin');
    const res = await request.post(baseUrl + '/admin/notify')
      .set('Authorization', token)
      .send(servicesToRestart);
    return res.body;
  } catch (err) {
    console.error(err);
  }
}

async function loginLeader (baseUrl) {
  const USERNAME = 'initial_user';
  let password;
  
  if (fs.existsSync(config.credentialsPath)) {
    password = fs.readFileSync(config.credentialsPath).toString().trim();
  } else {
    throw new Error('Initial user password was not found!');
  }
  return await requestToken(baseUrl, USERNAME, password);

  async function requestToken (baseUrl, USERNAME, password) {
    console.log('Requesting the token');
    const res = await request.post(baseUrl + '/auth/login')
      .send({
        username: USERNAME,
        password: password
      });
    return res.body.token;
  }
}
