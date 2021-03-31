const request = require('superagent');
const fs = require('fs');
const config = require('./config');

const logger = require('./logger').getLogger('apiCalls');

/**
 * Notify admin about new certificate to restart followers that uses the
 * certificates
 * @param {*} baseUrl
 */
exports.notifyLeader = async (baseUrl, servicesToRestart) => {
  try {
    const token = await loginLeader(baseUrl);
    logger.log('info', 'Notifying admin');
    const res = await request.post(baseUrl + '/admin/notify')
      .set('Authorization', token)
      .send(servicesToRestart);
    return res.body;
  } catch (err) {
    logger.log('error', err);
  }
}

async function loginLeader (baseUrl) {
  const USERNAME = 'initial_user';
  let password;
  
  if (fs.existsSync(config.get('leader:credentialsPath'))) {
    password = fs.readFileSync(config.get('leader:credentialsPath')).toString().trim();
  } else {
    throw new Error('Initial user password was not found!');
  }
  return await requestToken(baseUrl, USERNAME, password);

  async function requestToken (baseUrl, USERNAME, password) {
    logger.log('info', 'Requesting token from config-leader');
    const res = await request.post(baseUrl + '/auth/login')
      .send({
        username: USERNAME,
        password: password
      });
    return res.body.token;
  }
}
