const {
  updateSettings,
  rebootServices,
} = require('./apiCalls');

/**
 * This function is declared separately, because it is referenced in the tests
 */
module.exports.challengeCreateFn = async function (token, settings, authz, challenge, keyAuthorization) {
  await updateSettings(token, keyAuthorization, settings);
  await rebootServices(token, ['pryvio_dns']);
}