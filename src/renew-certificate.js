#!/usr/bin/node
const fs = require('fs')
const yaml = require('yamljs');
const { execSync } = require('child_process');
const request = require('superagent');
const { getLeaderAuth } = require('./retrieve-leader-auth');

main();
async function main () {
  try {
    const onlyDebug = true;
    const platformPath = '/app/conf/platform.yml';
    const platformConfig = yaml.load(platformPath);
    const domain = platformConfig.vars.MACHINES_AND_PLATFORM_SETTINGS.settings.DOMAIN.value
    console.log(`Checking the certificates for ${domain} domain`);
    
    const certMainDir = `/etc/letsencrypt/archive`
    const certDir = `${certMainDir}/${domain}`
    const certBackupDir = `${certMainDir}/tmp/${domain}`
    const baseUrl = `https://lead.${domain}`;

    // if certificate does not exist or will expire soon, request for the new certificates
    if (
      !fs.existsSync(`${certDir}/fullchain.pem`) ||
      !fs.existsSync(`${certDir}/privkey.pem`) ||
      isTimeToRenewCertificate(certDir)
    ) {
      backupCurrentCertificate(certDir, certBackupDir);
      requestNewCertificate(domain, onlyDebug);
      propagateCertificate(certDir, onlyDebug);
      await notifyAdmin(baseUrl);

      checkCertificateInFollowers(certMainDir, certDir);
      removeCertificateBackup(certBackupDir);
      console.log("End letsencrypt");
    }
  } catch (err) {
    console.error(err);
    loadOldCertificateFromBackup(certDir, certBackupDir);
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
  const validDaysUntilExpiration = (renewalDate - (new Date()).getTime()) / (1000 * 60 * 60 * 24.0)
  console.log(`Certificate will expire after: ${validDaysUntilExpiration} days`);
  return validDaysUntilExpiration < 30;
}

/**
 * Check if certificate is still valid for at lease 30 days
 */
function backupCurrentCertificate (certDir, certBackupDir) {
  console.log(`Backing up current certificates from: ${certDir} to ${certBackupDir}`);
  if (fs.existsSync(`${certBackupDir}/fullchain.pem`)) {
    fs.copyFileSync(`${certDir}/fullchain.pem`, `${certBackupDir}/fullchain.pem`);
  }
  if (fs.existsSync(`${certBackupDir}/privkey.pem`)) {
    fs.copyFileSync(`${certDir}/privkey.pem`, `${certBackupDir}/privkey.pem`);
  }
}

/**
 * In case of the error - return old certificate and log error
 */
function loadOldCertificateFromBackup (certDir, certBackupDir) {
  console.log(`Loading old certificates from ${certBackupDir}`);
  //fs.rmdirSync(certDir, { recursive: true });
  if (fs.existsSync(`${certBackupDir}/fullchain.pem`)) {
    fs.copyFileSync(`${certBackupDir}/fullchain.pem`, `${certDir}/fullchain.pem`);
  }
  if (fs.existsSync(`${certBackupDir}/privkey.pem`)) {
    fs.copyFileSync(`${certBackupDir}/privkey.pem`, `${certDir}/privkey.pem`);
  }
  console.log('Error: Certificates are not new');//TODO log more details
}

/**
 * Request letsencrypt certificate
 * TODO Maybe scripts could be part of this file
 * const scriptsDir = "/app/scripts"
 * --manual-auth-hook ${scriptsDir}/pre-renew-certificate.js \
 * --manual-cleanup-hook ${scriptsDir}/post-renew-certificate.sh \
 */
function requestNewCertificate (domain, onlyDebug) {
  let dryRunParameter = '';
  if (onlyDebug) {
    dryRunParameter = '--dry-run';
  }
  console.log('Requesting for a new certificate');
  const res = execSync(`echo "Y" | certbot certonly --manual \
    --manual-auth-hook /app/src/pre-renew-certificate.js \
    -d *.${domain} ${dryRunParameter}`);
  console.log('Response while requesting for the certificate: ', res.toString());
}

/**
 * Notify admin about new certificate to restart followers that uses the
 * certificates
 * @param {*} baseUrl
 */
async function notifyAdmin (baseUrl) {
  console.log('Notifying admin');
  const token = await getLeaderAuth();
  const servicesToRestart = ['pryvio_config_follower', 'pryvio_dns'];
  const res = await request.post(baseUrl + '/admin/notify')
    .set('Authorization', token)
    .send(servicesToRestart);
  return res.body;
}

function propagateCertificate (certDir) {
  console.log('Propagating certificate');
  const directories = execSync(
    'echo | find /app/data -name "secret" -type d',
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
    .split(/\r?\n/);

  directories.forEach(directory => {
    if (directory.length !== 0) {
      console.log(`Coppying certificate from: ${certDir}/fullchain.pem to: ${directory}/bundle.crt`)
      if (fs.existsSync(`${certDir}/fullchain.pem`)) {
        fs.copyFileSync(`${certDir}/fullchain.pem`, `${directory}/bundle.crt`);
      }
      if (fs.existsSync(`${certDir}/privkey.pem`)) {
        fs.copyFileSync(`${certDir}/privkey.pem`, `${directory}/key.pem`);
      }
    }
  });
}

/**
 * Check if the followers have the same certificates
 * @param {*} certDir 
 * @param {*} certDomainDir 
 */
function checkCertificateInFollowers (certDir, certDomainDir) {
  console.log('Checking certificates in the followers');
  const followersSettings = JSON.parse(fs.readFileSync('/app/conf/config-leader.json')).followers;
  Object.keys(followersSettings).forEach(followerkey => {
    let follower = followersSettings[followerkey].url;
    if (follower.startsWith("https://")) {
      const domain = follower.split('//')[1];
      // read certificate info and write content to `${certDir}/tmp.crt`
      execSync(`echo | openssl s_client -servername ${domain} -connect ${domain}:443 | sed -ne '/-BEGIN CERTIFICATE-/,/-END CERTIFICATE-/p' > ${certDir}/tmp.crt`);
      let tmpBuf1 = fs.readFileSync(`${certDir}/tmp.crt`);
      let tmpBuf2 = fs.readFileSync(`${certDomainDir}/cert.pem`);
      if (tmpBuf1.equals(tmpBuf2)) {
        console.log(`Success: ${follower} did receive the certificate`);
      } else {
        console.log(`Error: ${follower} did not receive the certificate`);
      }
    }
  });
}

function removeCertificateBackup (certBackupDir) {
  console.log('Removing certificate backup');
  fs.rmdirSync(certBackupDir, { recursive: true });
}
