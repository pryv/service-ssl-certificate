const request = require('superagent');
const fs = require('fs');

const { getLogger, getConfigUnsafe } = require('@pryv/boiler');

const logger = getLogger('apiCalls');
const config = getConfigUnsafe(true);

const LEADER_URL = config.get('leader:url');

/**
 * Notify admin about new certificate to restart followers that uses the
 * certificates
 * @param {*} servicesToRestart
 */
module.exports.notify = async (servicesToRestart) => {
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
};

module.exports.login = async () => {
  const USERNAME = 'initial_user';
  const CREDENTIALS_PATH = config.get('leader:credentialsPath')
  console.log('lookin for creds in', CREDENTIALS_PATH)
  
  if (fs.existsSync(CREDENTIALS_PATH)) {
    password = fs.readFileSync(CREDENTIALS_PATH).toString().trim();
  } else {
    throw new Error('Initial user password was not found!');
  }
  return await requestToken(LEADER_URL, USERNAME, password);

  async function requestToken (LEADER_URL, USERNAME, password) {
    logger.log('info', 'Requesting token from config-leader: ' + LEADER_URL);
    const res = await request.post(LEADER_URL + '/auth/login')
      .send({
        username: USERNAME,
        password: password
      });
    console.log('request to', LEADER_URL, 'response', res.body);
    return res.body.token;
  }
}
