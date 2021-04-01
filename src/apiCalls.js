const request = require('superagent');
const fs = require('fs');
const config = require('./config');

const logger = require('./logger').getLogger('apiCalls');

const CREDENTIALS_PATH = config.get('leader:credentialsPath');
const LEADER_URL = config.get('leader:url');

/**
 * Notify admin about new certificate to restart followers that uses the
 * certificates
 * @param {*} servicesToRestart
 */
exports.notifyLeader = async (servicesToRestart) => {
  try {
    const token = await loginLeader(LEADER_URL);
    logger.log('info', 'Notifying admin');
    const res = await request.post(LEADER_URL + '/admin/notify')
      .set('Authorization', token)
      .send(servicesToRestart);
    return res.body;
  } catch (err) {
    logger.log('error', err);
  }
}

async function loginLeader () {
  const USERNAME = 'initial_user';
  let password;
  
  if (fs.existsSync(CREDENTIALS_PATH)) {
    password = fs.readFileSync(CREDENTIALS_PATH).toString().trim();
  } else {
    throw new Error('Initial user password was not found!');
  }
  return await requestToken(LEADER_URL, USERNAME, password);

  async function requestToken (LEADER_URL, USERNAME, password) {
    logger.log('info', 'Requesting token from config-leader');
    const res = await request.post(LEADER_URL + '/auth/login')
      .send({
        username: USERNAME,
        password: password
      });
    return res.body.token;
  }
}
