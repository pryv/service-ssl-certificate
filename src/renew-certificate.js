#!/usr/bin/node
const fs = require('fs');
const yaml = require('yamljs');
const { execSync } = require('child_process');
const { notifyAdmin } = require('./apiCalls');
const config = require('./config');

const logger = require('./logger').getLogger('renew-certificate');

async function renewCertificate () {
  logger.log('info', 'Debug mode', config.get('debug'));
  const platformConfig = yaml.load(config.get('platformYmlPath'));
  const domain = platformConfig.vars.MACHINES_AND_PLATFORM_SETTINGS.settings.DOMAIN.value;
  const email = platformConfig.vars.ADVANCED_API_SETTINGS.settings.LETSENCRYPT_EMAIL.value;
  const certDir = `${config.get('certMainDir')}/${domain}`;
  const certBackupDir = `${config.get('certMainDir')}/tmp/${domain}`;
  const baseUrl = `https://lead.${domain}`;

  logger.log('info', `Checking the certificates for ${domain} domain`);
  try {
    copyCertificatesFromNginxIfNeeded(certDir, domain);

    // if certificate does not exist or will expire soon, request for the new certificates
    if (
      !fs.existsSync(`${certDir}/fullchain.pem`) ||
      !fs.existsSync(`${certDir}/privkey.pem`) ||
      isTimeToRenewCertificate(certDir) ||
      config.get('debug')
    ) {
      backupCurrentCertificate(certDir, certBackupDir);
      requestNewCertificate(domain, config.get('debug'), email);
      copyCertificate(certDir, domain);
      await notifyAdmin(baseUrl, ['pryvio_nginx']);

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * For the first time in systems that already have the certificate,
 * they will exist only in the nginx config. Copy them to letsencrypt folder
 */
function copyCertificatesFromNginxIfNeeded (certDir, domain) {
  if (fs.existsSync(`${certDir}/fullchain.pem`) &&
      fs.existsSync(`${certDir}/privkey.pem`)) {
    return;
  }
  const directories = getDirectoriesWithSecrets();

  if (directories.length > 0) {
    logger.log('info', 'Copying ssl certificate from nginx to letsencrypt directory');
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
    }
    if (
      !fs.existsSync(`${directories[0]}/${domain}-bundle.crt`) &&
      !fs.existsSync(`${directories[0]}/${domain}-key.pem`)
    ) {
      throw new Error(`The certificates are not found neither in letsencrypt directory: 
      ${certDir}/fullchain.pem and ${certDir}/privkey.pem, neither in nginx secrets folder
      ${directories[0]}/${domain}-bundle.crt and ${directories[0]}/${domain}-key.pem`);
    }
    logger.log('info', `${directories[0]}/${domain}-bundle.crt => ${certDir}/fullchain.pem`);
    fs.copyFileSync(`${directories[0]}/${domain}-bundle.crt`, `${certDir}/fullchain.pem`);
    fs.copyFileSync(`${directories[0]}/${domain}-key.pem`, `${certDir}/privkey.pem`);
  }
}

/**
 * Check if certificate is still valid for at lease 30 days
 */
function isTimeToRenewCertificate (certDir) {
  logger.log('info', 'Checking if it is time to renew the certificates');
  logger.log('info', `openssl x509 -enddate -noout -in ${certDir}/fullchain.pem`);
  const res = execSync(`openssl x509 -enddate -noout -in ${certDir}/fullchain.pem`).toString();
  const renewalDate = Date.parse(res.split('=')[1]);

  if (isNaN(renewalDate)) {
    throw new Error('Failed to parse the certificate validity date from the response.');
  }
  
  const validDaysUntilExpiration = ((renewalDate - (new Date()).getTime()) / (1000 * 60 * 60 * 24.0)).toFixed();
  logger.log('info', `Certificate will expire after: ${validDaysUntilExpiration} days`);
  return validDaysUntilExpiration < 30;
}

/**
 * Check if certificate is still valid for at lease 30 days
 */
function backupCurrentCertificate (certDir, certBackupDir) {
  logger.log('info', `Backing up current certificates from: ${certDir} to ${certBackupDir}`);
  if (!fs.existsSync(certBackupDir)) {
    fs.mkdirSync(certBackupDir, { recursive: true });
  }
  if (fs.existsSync(`${certDir}/fullchain.pem`)) {
    fs.copyFileSync(`${certDir}/fullchain.pem`, `${certBackupDir}/fullchain.pem`);
  }
  if (fs.existsSync(`${certDir}/privkey.pem`)) {
    fs.copyFileSync(`${certDir}/privkey.pem`, `${certBackupDir}/privkey.pem`);
  }
}

/**
 * In case of error - return old certificate and log error
 */
function loadOldCertificateFromBackup (certDir, certBackupDir) {
  logger.log('error', `Error: Loading old certificates if they exists from ${certBackupDir} because of the errors mentioned above`);

  if (fs.existsSync(`${certBackupDir}/fullchain.pem`)) {
    fs.copyFileSync(`${certBackupDir}/fullchain.pem`, `${certDir}/fullchain.pem`);
  }
  if (fs.existsSync(`${certBackupDir}/privkey.pem`)) {
    fs.copyFileSync(`${certBackupDir}/privkey.pem`, `${certDir}/privkey.pem`);
  }
}

/**
 * Request letsencrypt certificate
 * @param string domain 
 * @param boolean onlyDebug 
 */
function requestNewCertificate (domain, onlyDebug, email) {
  let dryRunParameter = '';
  if (onlyDebug) {
    dryRunParameter = '--dry-run';
  }
  logger.log('info', 'Requesting for a new certificate');
  const certCommand = `echo "Y" | certbot certonly --manual \
    --manual-auth-hook "node /app/src/setDnsChallenge.js" \
    --cert-name ${domain} \
    -d *.${domain} -m ${email} ${dryRunParameter}`
    logger.log('info', certCommand);
  const res = execSync(certCommand);
  logger.log('info', 'Response while requesting for the certificate: ', res.toString());
}

function getDirectoriesWithSecrets () {
  return execSync(
    'echo | find /app/data -name "secret" -type d',
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
    .split(/\r?\n/);
}

/**
 * certificate may be saved in /etc/letsencrypt/live/pryv-li or /etc/letsencrypt/live/pryv-li-0001 or
 * similar directory so we will find the directory that is the last edited
 */
function getNewCertDir (certDir) {
  return execSync(`ls -td ${certDir}*/ | head -1`).toString().trim();
}

/**
 * Propagate certificates to all directories
 * in the config with name 'secret'
 * @param string certDir 
 * @param string domain
 */
function copyCertificate (certDir, domain) {
  logger.log('info', 'Copying ssl certificate');
  const newCertDir = getNewCertDir(certDir);
  const directories = getDirectoriesWithSecrets();

  directories.forEach(directory => {
    if (directory.length !== 0) {
      logger.log('info', `Copying certificate from: ${newCertDir}fullchain.pem to: ${directory}/bundle.crt`)
      fs.copyFileSync(`${newCertDir}fullchain.pem`, `${directory}/${domain}-bundle.crt`);
      fs.copyFileSync(`${newCertDir}privkey.pem`, `${directory}/${domain}-key.pem`);
    }
  });
}

/**
 * Check if the followers have the same certificates
 * @param {*} certDir 
 * @param {*} certDomainDir 
 */
function checkCertificateInFollowers (certDir) {
  logger.log('info', 'Checking certificates in the followers');
  const followersSettings = JSON.parse(fs.readFileSync(config.get('followerSettingsFile'))).followers;
  const newCertDir = getNewCertDir(certDir);
  Object.keys(followersSettings).forEach(followerkey => {
    let follower = followersSettings[followerkey].url;
    if (follower.startsWith('https://')) {
      const domain = follower.split('//')[1];
      let certInFollower = execSync(`echo | openssl s_client -servername ${domain} -connect ${domain}:443 | sed -ne '/-BEGIN CERTIFICATE-/,/-END CERTIFICATE-/p'`)
        .toString()
        .trim();

      const certificateSeparator = 'END CERTIFICATE-----';
      let mainCert = fs.readFileSync(`${newCertDir}fullchain.pem`).toString()
        .split(certificateSeparator)[0]
        .trim() + certificateSeparator;

      if (certInFollower === mainCert) {
        logger.log('info', `Success: ${follower} did receive the certificate`);
      } else {
        logger.log('info', `Error: ${follower} did not receive the certificate`);
      }
    }
  });
}