const request = require('superagent');
const fs = require('fs');
const url = require('url');

const { getLogger, getConfigUnsafe } = require('@pryv/boiler');

const logger = getLogger('apiCalls');
const config = getConfigUnsafe(true);

const LEADER_URL = config.get('leader:url');

module.exports.login = async () => {
  const USERNAME = 'initial_user';
  const CREDENTIALS_PATH = config.get('leader:credentialsPath');

  let password;
  if (fs.existsSync(CREDENTIALS_PATH)) {
    password = fs.readFileSync(CREDENTIALS_PATH, 'utf-8').toString().trim();
  } else {
    throw new Error(`${USERNAME} password was not found in ${CREDENTIALS_PATH}!`);
  }
  return requestToken(LEADER_URL, USERNAME, password);

  async function requestToken(LEADER_URL, USERNAME, password) {
    const callUrl = url.resolve(LEADER_URL, '/auth/login');
    logger.log('info', `Requesting token from config-leader at: ${callUrl}`);
    const res = await request.post(callUrl)
      .send({
        username: USERNAME,
        password,
      });
    return res.body.token;
  }
};

module.exports.getSettings = async (token) => {
  const callUrl = url.resolve(LEADER_URL, '/admin/settings');
  logger.info(`fetching settings from leader at ${callUrl}`);
  const res = await request.get(callUrl)
    .set('authorization', token);
  return res.body.settings;
};

module.exports.updateDnsTxtRecord = async (token, challenge, settings) => {
  const callUrl = url.resolve(LEADER_URL, '/admin/settings');
  logger.info(`Updating settings to leader at ${callUrl}, setting challenge: ${challenge}`);
  settings.DNS_SETTINGS.settings.DNS_CUSTOM_ENTRIES.value['_acme-challenge'] = { description: challenge };
  const res = await request.put(callUrl)
    .set('authorization', token)
    .send(settings);
  return res.body;
};

/**
 * Notify admin about new certificate to restart followers that uses the
 * certificates
 * @param {*} servicesToRestart Array of strings
 */
module.exports.rebootServices = async (token, servicesToRestart) => {
  const callUrl = url.resolve(LEADER_URL, '/admin/notify');
  logger.info(`Rebooting services ${servicesToRestart} on leader at: ${callUrl}`);
  const res = await request.post(callUrl)
    .set('authorization', token)
    .send({ services: servicesToRestart });
  const body = res.body;
  if (body.successes != null ) logger.info(`Rebooted services: ${res.body}`)
  if (body.failures != null && body.failures.length > 0) throw new Error(`Failed to reboot services: ${body.failures}`)
  return res.body;
};
