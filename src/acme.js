const {
  updateDnsTxtRecord,
  rebootServices,
} = require('./apiCalls');

const dns = require('dns-dig');

/**
 * This function is declared separately, because it is referenced in the tests
 */
module.exports.challengeCreateFn = async function (domain, token, settings, authz, challenge, keyAuthorization) {
  await updateDnsTxtRecord(token, keyAuthorization, settings);
  await rebootServices(token, ['pryvio_dns']);

  const txtRecordHostname = '_acme-challenge.' + domain;

  let isTxtRecordSet = false
  while(! isTxtRecordSet) {
    const txtRecords = await dns.resolveTxt(txtRecordHostname);
    if (txtRecords.length > 0 && txtRecords[0] === keyAuthorization) isTxtRecordSet = true;
  }
}