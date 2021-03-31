#!/usr/bin/node
const fs = require('fs');
const yaml = require('yamljs');
const path = require('path');
const { execSync } = require('child_process');
const { notifyLeader } = require('./apiCalls');
const config = require('./config');

const logger = require('./logger').getLogger('renew-certificate');

async function renewCertificate () {
  logger.log('info', 'Debug mode=' + config.get('debug') + ', dry-run=' + config.get('isDryRun'));
  const platformConfig = yaml.load(config.get('platformYmlPath'));
  const domain = platformConfig.vars.MACHINES_AND_PLATFORM_SETTINGS.settings.DOMAIN.value;
  const email = platformConfig.vars.ADVANCED_API_SETTINGS.settings.LETSENCRYPT_EMAIL.value;
  const certDir = path.join(config.get('letsencrypt:certsDir'), domain);
  const certBackupDir = path.join(config.get('letsencrypt:certsDir'), '/tmp', domain);
  const leaderUrl = config.get('leader:url');

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
      requestNewCertificate(domain, email);
      copyCertificate(certDir, domain);
      await notifyLeader(leaderUrl, ['pryvio_nginx']);

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
  const command = `openssl x509 -enddate -noout -in ${certDir}/fullchain.pem`;
  logger.log('info', command);
  const res = execSync(command).toString();
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

  const sourceCertPath = path.join(certDir, 'fullchain.pem');
  const backupCertPath = path.join(certBackupDir, 'fullchain.pem');
  const sourceKeyPath = path.join(certDir, 'privkey.pem');
  const backupKeyPath = path.join(certBackupDir, 'privkey.pem');

  if (fs.existsSync(sourceCertPath)) {
    fs.copyFileSync(sourceCertPath, backupCertPath);
  }
  if (fs.existsSync(sourceKeyPath)) {
    fs.copyFileSync(sourceKeyPath, backupKeyPath);
  }
}

/**
 * In case of error - return old certificate and log error
 */
function loadOldCertificateFromBackup (certDir, certBackupDir) {
  logger.log('error', `Error: Loading old certificates if they exists from ${certBackupDir} because of the errors mentioned above`);

  const sourceCertPath = path.join(certDir, 'fullchain.pem');
  const backupCertPath = path.join(certBackupDir, 'fullchain.pem');
  const sourceKeyPath = path.join(certDir, 'privkey.pem');
  const backupKeyPath = path.join(certBackupDir, 'privkey.pem');

  if (fs.existsSync(backupCertPath)) {
    fs.copyFileSync(backupCertPath, sourceCertPath);
  }
  if (fs.existsSync(backupKeyPath)) {
    fs.copyFileSync(backupKeyPath, sourceKeyPath);
  }
}

/**
 * Request letsencrypt certificate
 * @param string domain 
 * @param boolean onlyDebug 
 */
function requestNewCertificate (domain, email) {
  let dryRunParameter = '';
  if (config.get('isDryRun')) {
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
function getLatestSubDir (dir) {
  return execSync(`ls -td ${dir}*/ | head -1`).toString().trim();
}

/**
 * Propagate certificates to all directories
 * in the config with name 'secret'
 * @param string certDir 
 * @param string domain
 */
function copyCertificate (certDir, domain) {
  logger.log('info', 'Copying ssl certificate from ' + certDir);
  const latestCertDir = getLatestSubDir(certDir);
  const nginxSecretsDirectories = getDirectoriesWithSecrets();

  nginxSecretsDirectories.forEach(nginxSecretsDir => {
    if (nginxSecretsDir.length !== 0) {
      const certPath = path.join(latestCertDir, 'fullchain.pem');
      const nginxCertPath = path.join(nginxSecretsDir, domain + '-bundle.crt');
      const keyPath = path.join(latestCertDir, 'privkey.pem');
      const nginxKeyPath = path.join(nginxSecretsDir, domain + '-key.pem');
      
      logger.log('info', `Copying certificate from: ${certPath} to: ${nginxCertPath}`)
      fs.copyFileSync(certPath, nginxCertPath);
      fs.copyFileSync(keyPath, nginxKeyPath);
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
  const followersSettings = JSON.parse(fs.readFileSync(config.get('leader:configPath'))).followers;
  const latestCertDir = getLatestSubDir(certDir);
  Object.keys(followersSettings).forEach(followerkey => {
    let follower = followersSettings[followerkey].url;
    if (follower.startsWith('https://')) {
      const domain = follower.split('//')[1];
      let certInFollower = execSync(`echo | openssl s_client -servername ${domain} -connect ${domain}:443 | sed -ne '/-BEGIN CERTIFICATE-/,/-END CERTIFICATE-/p'`)
        .toString()
        .trim();

      const certificateSeparator = 'END CERTIFICATE-----';
      const latestCert = path.join(latestCertDir, 'fullchain.pem');
      const mainCert = fs.readFileSync(latestCert).toString()
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