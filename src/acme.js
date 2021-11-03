const acme = require('acme-client');
const {
  updateSettings,
  rebootServices,
} = require('./apiCalls');

const { getConfigUnsafe, getLogger } = require('@pryv/boiler');
const config = getConfigUnsafe(true);
const logger = getLogger('acme');

module.exports.challengeCreateFn = async function (token, settings, authz, challenge, keyAuthorization) {
  logger.info('hello?')
  await updateSettings(token, keyAuthorization, settings);
  await rebootServices(token, ['pryvio_dns']);
}