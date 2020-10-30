#!/usr/bin/node
const fs = require('fs');
const yaml = require('yamljs');
const { execSync } = require('child_process');
const { notifyAdmin } = require('./apiCalls');


async function renewCertificate () {
  let debug = false;
  if (process.env.DEBUG?.toString().toLowerCase() === 'true') {
    debug = true;
  }

  console.log('Debug mode', debug);
  const platformYmlPath = (process.env.PLATFORM_YML)? process.env.PLATFORM_YML : '/app/conf/platform.yml';
  const certMainDir = (process.env.CERT_DIR)? process.env.CERT_DIR : '/etc/letsencrypt/live';

  const platformConfig = yaml.load(platformYmlPath);
  const domain = platformConfig.vars.MACHINES_AND_PLATFORM_SETTINGS.settings.DOMAIN.value;
  const email = platformConfig.vars.ADVANCED_API_SETTINGS.settings.LETSENCRYPT_EMAIL.value;
  const certDir = `${certMainDir}/${domain}`;
  const certBackupDir = `${certMainDir}/tmp/${domain}`;
  const baseUrl = `https://lead.${domain}`;

  console.log(`Checking the certificates for ${domain} domain`);
  try {
    copyCertificatesFromNginxIfNeeded(certDir, domain);

    // if certificate does not exist or will expire soon, request for the new certificates
    if (
      !fs.existsSync(`${certDir}/fullchain.pem`) ||
      !fs.existsSync(`${certDir}/privkey.pem`) ||
      isTimeToRenewCertificate(certDir) ||
      debug
    ) {
      backupCurrentCertificate(certDir, certBackupDir);
      requestNewCertificate(domain, debug, email);
      copyCertificate(certDir, domain);
      await notifyAdmin(baseUrl, ['pryvio_nginx']);

      // wait for 30 seconds so that followers would have time to restart
      console.log('Waiting for half a minute until followers will reloaded');
      await sleep((process.env.WAIT_UNTIL_FOLLOWERS_RELOAD_MS) ? process.env.WAIT_UNTIL_FOLLOWERS_RELOAD_MS : 30000);
      checkCertificateInFollowers(certDir);
      console.log('End letsencrypt');
    }
  } catch (err) {
    if (err.error) {
      console.error(err.error);
    } else {
      console.error(err);
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
    console.log('Copying ssl certificate from nginx to letsencrypt directory');
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
    }
    if (fs.existsSync(`${directories[0]}/${domain}-bundle.crt`)) {
      console.log(`${directories[0]}/${domain}-bundle.crt => ${certDir}/fullchain.pem`);
      fs.copyFileSync(`${directories[0]}/${domain}-bundle.crt`, `${certDir}/fullchain.pem`);
    }
    if (fs.existsSync(`${directories[0]}/${domain}-key.pem`)) {
      fs.copyFileSync(`${directories[0]}/${domain}-key.pem`, `${certDir}/privkey.pem`);
    }
  }
}

/**
 * Check if certificate is still valid for at lease 30 days
 */
function isTimeToRenewCertificate (certDir) {
  console.log('Checking if it is time to renew the certificates');
  console.log(`openssl x509 -enddate -noout -in ${certDir}/fullchain.pem`);
  const res = execSync(`openssl x509 -enddate -noout -in ${certDir}/fullchain.pem`).toString();
  const renewalDate = Date.parse(res.split('=')[1]);
  const validDaysUntilExpiration = ((renewalDate - (new Date()).getTime()) / (1000 * 60 * 60 * 24.0)).toFixed();
  console.log(`Certificate will expire after: ${validDaysUntilExpiration} days`);
  return validDaysUntilExpiration && validDaysUntilExpiration < 30;
}

/**
 * Check if certificate is still valid for at lease 30 days
 */
function backupCurrentCertificate (certDir, certBackupDir) {
  console.log(`Backing up current certificates from: ${certDir} to ${certBackupDir}`);
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
  console.log(`Error: Loading old certificates if they exists from ${certBackupDir} because of the errors mentioned above`);

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
  console.log('Requesting for a new certificate');
  const certCommand = `echo "Y" | certbot certonly --manual \
    --manual-auth-hook "node /app/src/setDnsChallenge.js" \
    --cert-name ${domain} \
    -d *.${domain} -m ${email} ${dryRunParameter}`
  console.log(certCommand);
  const res = execSync(certCommand);
  console.log('Response while requesting for the certificate: ', res.toString());
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
  console.log('Copying ssl certificate');
  const newCertDir = getNewCertDir(certDir);
  const directories = getDirectoriesWithSecrets();

  directories.forEach(directory => {
    if (directory.length !== 0) {
      console.log(`Coppying certificate from: ${newCertDir}fullchain.pem to: ${directory}/bundle.crt`)
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
  console.log('Checking certificates in the followers');
  const followerSettingsFile = (process.env.CONFIG_LEADER_FILEPATH) ? process.env.CONFIG_LEADER_FILEPATH : '/app/conf/config-leader.json';
  const followersSettings = JSON.parse(fs.readFileSync(followerSettingsFile)).followers;
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
        console.log(`Success: ${follower} did receive the certificate`);
      } else {
        console.log(`Error: ${follower} did not receive the certificate`);
      }
    }
  });
}