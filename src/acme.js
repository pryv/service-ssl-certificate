const dns = require('dns-dig');
const { getLogger, getConfig } = require('@pryv/boiler');
const {
  updateDnsTxtRecord,
  rebootServices,
} = require('./apiCalls');

/**
 * This function is declared separately, because it is referenced in the tests
 */
module.exports.challengeCreateFn = async function (domain, token, settings, nameServerHostnames, authz, challenge, keyAuthorization) {
  const logger = getLogger('acme');
  const config = await getConfig();
  const dnsWaitTime = config.get('acme:dnsWaitTime');
  await updateDnsTxtRecord(token, keyAuthorization, settings);
  await rebootServices(token, ['pryvio_dns']);

  const txtRecordHostname = `_acme-challenge.${domain}`;

  const areTxtRecordsSet = {};
  nameServerHostnames.forEach((h) => areTxtRecordsSet[h] = false);

  for (const hostname of nameServerHostnames) {
    while (! areTxtRecordsSet[hostname]) {
      logger.info(`Checking DNS challenge ${txtRecordHostname} by ${hostname}`);
      const txtRecords = await dns.resolveTxt(txtRecordHostname, { host: hostname });
      logger.info(`Obtained ${txtRecords}`);
      if (txtRecords.length > 0 && txtRecords[0] === keyAuthorization) areTxtRecordsSet[hostname] = true;
      await sleep(dnsWaitTime);
    }
  }
};

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
