const fs = require('fs')
const yaml = require('yamljs');
const { execSync } = require('child_process');
const request = require('superagent');

main();
async function main () {
  try {
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
      requestNewCertificate(domain);
      propagateCertificate(certDir);
      await notifyAdmin(token, baseUrl);

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
  const res = execSync(`"$((($(echo | openssl x509 -enddate -noout 
    -in ${certDir}/fullchain.pem| sed 's/^.\{9\}//' | date  -f - '+%s') 
    - $(date '+%s'))/43200))") -lt 30])`);
  console.log('Response while checking certificate expiration date: ', res);
  return false; //TODO
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
function requestNewCertificate (domain) {
  console.log('Requesting for a new certificate');
  const res = execSync(`echo "Y" | certbot certonly --manual \
    --manual-auth-hook /app/pre-renew-certificate.js \
    -d *.${domain} --dry-run`);
  console.log('Response while requesting for the certificate: ', res);
}

/**
 * Notify admin about new certificate to restart followers that uses the
 * certificates
 * @param {*} token 
 * @param {*} baseUrl
 */
async function notifyAdmin (token,baseUrl) {
  console.log('Notifying admin');
  const servicesToRestart = ['pryvio_config_follower', 'pryvio_dns'];
  const res = await request.post(baseUrl + '/admin/notify')
    .set('Authorization', token)
    .send(servicesToRestart);
  return res.body;
}

function propagateCertificate (certDir) {
  console.log('Propagating certificate');
  directories = execSync('find /app/data -name "secret" -type d');
  // When acknowledged, put fullchain.pem > pryv.li - bundle.crt and 
  // privkey.pem > pryv.li - key.pem
  console.log(directories, 'directories delete this log TODO');
  directories.forEach(directory => {
    console.log(`Coppying certificate from: ${certDir}/test_renew.crt to: ${directory}/test.crt`)
    fs.copyFileSync(`${certDir}/test_renew.crt`, `${directory}/test.crt`);
  });
}

function checkCertificateInFollowers (certDir, certDomainDir) {
  console.log('Checking certificates in the followers');
  const followersSettings = JSON.parse(fs.readFileSync('/app/conf/config-leader.json')).followers;
  Object.keys(followersSettings).forEach(followerkey => {
    let follower = followersSettings[followerkey].url;
    console.log(follower, 'follower');
    if (follower.startsWith("https://")) {
      execSync(`echo | openssl s_client -servername ${follower} -connect ${follower}:443 | sed -ne '/-BEGIN CERTIFICATE-/,/-END CERTIFICATE-/p' > ${certDir}/tmp.crt`);
      let tmpBuf1 = fs.readFileSync(`${certDir}/tmp.crt`);
      let tmpBuf2 = fs.readFileSync(`${certDomainDir}/cert.pem`);
      // TODO
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