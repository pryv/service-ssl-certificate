#!/usr/bin/node
const fs = require('fs');
const yaml = require('yamljs');
const path = require('path');
const { execSync } = require('child_process');
const { notifyLeader } = require('./apiCalls');
const config = require('./config');
const platformConfig = require('./platformConfig');

const logger = require('./logger').getLogger('renew-certificate');

const { 
  sleep,
  copyCertificatesFromNginxIfNeeded,
  isTimeToRenewCertificate,
  backupCurrentCertificate,
  copyCertificate,
  checkCertificateInFollowers,
  loadOldCertificateFromBackup,
} = require('./operations');

async function renewCertificate () {
  logger.log('info', 'Debug mode=' + config.get('debug:isActive') + ', dry-run=' + config.get('dryRun:isActive'));

  const domain = platformConfig.get('vars:MACHINES_AND_PLATFORM_SETTINGS:settings:DOMAIN:value');
  const email = platformConfig.get('vars:ADVANCED_API_SETTINGS:settings:LETSENCRYPT_EMAIL:value');
  const certDir = path.join(config.get('letsencrypt:certsDir'), domain);
  const certFile = path.join(certDir, 'fullchain.pem');
  const keyFile = path.join(certDir, 'privkey.pem');
  const certBackupDir = path.join(config.get('letsencrypt:certsDir'), '/tmp', domain);
  const leaderUrl = config.get('leader:url');

  logger.log('info', `Checking the certificates for ${domain} domain`);
  try {
    copyCertificatesFromNginxIfNeeded(certDir, domain);

    // if certificate does not exist or will expire soon, request for the new certificates
    if (
      !fs.existsSync(certFile) ||
      !fs.existsSync(keyFile) ||
      isTimeToRenewCertificate(certFile) ||
      config.get('debug:isActive')
    ) {
      backupCurrentCertificate(certDir, certBackupDir);
      requestNewCertificate(domain, email);
      copyCertificate(certDir, domain);
      await notifyLeader(['pryvio_nginx']);

      // wait for 30 seconds so that followers would have time to restart
      logger.log('info', 'Waiting for half a minute until followers will reloaded');
      await sleep(config.get('waitUntilFollowersReloadMs'));
      checkCertificateInFollowers(certDir);
      logger.log('info', 'End letsencrypt');
    }
  } catch (err) {
    if (err.error) {
      logger.log('error', err.error);
    } else {
      logger.log('error', err);
    }
    loadOldCertificateFromBackup(certDir, certBackupDir);
  }
}
exports.renewCertificate = renewCertificate;

/**
 * Request letsencrypt certificate
 * @param string domain 
 * @param boolean onlyDebug 
 */
function requestNewCertificate (domain, email) {
  let dryRunParameter = '';
  if (config.get('dryRun:isActive')) {
    dryRunParameter = '--dry-run';
  }
  logger.log('info', 'Requesting for a new certificate');
  const certCommand = `echo "Y" | certbot certonly --manual \
    --manual-auth-hook "node /app/src/setDnsChallenge.js" \
    --cert-name ${domain} \
    -d *.${domain} -m ${email} ${dryRunParameter}`;
  logger.log('info', certCommand);
  const res = execSync(certCommand);
  logger.log('info', 'Response while requesting for the certificate: ', res.toString());
}
