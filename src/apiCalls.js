/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const request = require('superagent');
const fs = require('fs');

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

  async function requestToken (LEADER_URL, USERNAME, password) {
    const callUrl = (new URL('/auth/login', LEADER_URL)).href;
    logger.log('info', `Requesting token from config-leader at: ${callUrl}`);
    const res = await request.post(callUrl)
      .send({
        username: USERNAME,
        password
      });
    return res.body.token;
  }
};

module.exports.getSettings = async (token) => {
  const callUrl = (new URL('/admin/settings', LEADER_URL)).href;
  logger.info(`fetching settings from leader at ${callUrl}`);
  const res = await request.get(callUrl)
    .set('authorization', token);
  return res.body.settings;
};

module.exports.updateDnsTxtRecord = async (token, challenge, settings) => {
  const callUrl = (new URL('/admin/settings', LEADER_URL)).href;
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
  const callUrl = (new URL('/admin/notify', LEADER_URL)).href;
  logger.info(`Rebooting services ${servicesToRestart} on leader at: ${callUrl}`);
  const res = await request.post(callUrl)
    .set('authorization', token)
    .send({ services: servicesToRestart });
  const body = res.body;
  if (body.successes != null) logger.info(`Rebooted services: ${JSON.stringify(body.successes)}`);
  if (body.failures != null && body.failures.length > 0) throw new Error(`Failed to reboot services by followers: ${JSON.stringify(body.failures)}`);
  return body;
};
