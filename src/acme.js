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
  const dnsTriesCount = config.get('acme:dnsTriesCount');
  const dnsServiceKey = config.get('leader:serviceKeys:dns');
  await updateDnsTxtRecord(token, keyAuthorization, settings);
  await rebootServices(token, [dnsServiceKey]);

  const txtRecordHostname = `_acme-challenge.${domain}`;

  const areTxtRecordsSet = {};
  nameServerHostnames.forEach((h) => areTxtRecordsSet[h] = false);

  for (const hostname of nameServerHostnames) {
    let i = 0;
    while (! areTxtRecordsSet[hostname] && i < dnsTriesCount) {
      logger.info(`Checking DNS challenge ${txtRecordHostname} by ${hostname}`);
      const txtRecords = await dns.resolveTxt(txtRecordHostname, { host: hostname });
      logger.info(`Obtained ${txtRecords}`);
      if (txtRecords.length > 0 && txtRecords[0] === keyAuthorization) areTxtRecordsSet[hostname] = true;
      await sleep(dnsWaitTime);
      i++;
    }
    if (i === dnsTriesCount) {
      logger.error(`DNS challenge not found in ${hostname} after ${dnsTriesCount} tries... Aborting.`);
    }
  }
  logger.info(`challenge set in both name servers for domain ${domain}. Proceeding with ACME validation...`);
};

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
