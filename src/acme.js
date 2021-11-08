const dns = require('dns-dig');
const { getLogger, getConfig } = require('@pryv/boiler');
const {
  updateDnsTxtRecord,
  rebootServices,
} = require('./apiCalls');

/**
 * This function is declared separately, because it is referenced in the tests
 */
module.exports.challengeCreateFn = async function (domain, token, settings, authz, challenge, keyAuthorization) {
  const logger = getLogger('acme');
  const config = await getConfig();
  const dnsWaitTime = config.get('acme:dnsWaitTime');
  await updateDnsTxtRecord(token, keyAuthorization, settings);
  await rebootServices(token, ['pryvio_dns']);

  const txtRecordHostname = `_acme-challenge.${domain}`;

  let isTxtRecordSet = false;
  while (! isTxtRecordSet) {
    logger.info(`Checking DNS challenge ${txtRecordHostname}`);
    const txtRecords = await dns.resolveTxt(txtRecordHostname);
    logger.info(`Obtained ${txtRecords}`);
    if (txtRecords.length > 0 && txtRecords[0] === keyAuthorization) isTxtRecordSet = true;
    await sleep(dnsWaitTime);
  }
};

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
