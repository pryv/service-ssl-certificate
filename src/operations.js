
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const bluebird = require('bluebird');
const pem = require('pem');

const parseCertificate = bluebird.promisify(pem.readCertificateInfo);

const config = require('./config');
const logger = require('./logger').getLogger('operations');

const templatesDir = config.get('leader:templatesPath');

/**
 * Returns fullpath to directories containing directory named "secret".
 */
const getTemplateSecretsDirectories = () => {
  
  const secretDirs = [];
  findSecretDirs(templatesDir);
  return secretDirs;

  function findSecretDirs(rootDir) {
    const subDirs = fs.readdirSync(rootDir, { withFileTypes: true }).filter(dirent => dirent.isDirectory());
    subDirs.forEach(dir => {
      const fullPath = path.join(rootDir, dir.name);
      if (dir.name === 'secret') secretDirs.push(fullPath);
      findSecretDirs(fullPath);
    });
  };
};
module.exports.getTemplateSecretsDirectories = getTemplateSecretsDirectories;

/**
 * Check if certificate is still valid for at lease 30 days
 */
module.exports.isTimeToRenewCertificate = async (certFile) => {
  logger.log('info', 'Checking if it is time to renew the certificates ' + certFile);
  
  const certText = fs.readFileSync(certFile, { encoding: 'utf8' });
  const certificate = await parseCertificate(certText);
  const expirationTimestamp = extractExpirationTimestamp(certificate)

  if (isNaN(expirationTimestamp)) {
    throw new Error('Failed to parse the certificate validity date from the response.');
  }
  
  const nowTimestamp = Date.now();
  const daysUntilExpiration = ((expirationTimestamp - nowTimestamp) / (1000 * 60 * 60 * 24.0)).toFixed();
  logger.log('info', `Certificate will expire after: ${daysUntilExpiration} days`);
  return daysUntilExpiration <= 30;

  function extractExpirationTimestamp(cert) {
    return cert.validity.end;
  }
}

module.exports.sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * When running for the first time, we'll have generated the SSL certificate manually.
 * So we must fetch it from NGINX's secret/ folder
 
module.exports.copyCertificatesFromNginxIfNeeded = (certDir, domain) => {
  const letsEncryptCert = path.join(certDir, 'fullchain.pem');
  const letsEncryptKey = path.join(certDir, 'privkey.pem');

  if (fs.existsSync(letsEncryptCert) && fs.existsSync(letsEncryptKey)) {
    return;
  }
  const directories = module.exports.getTemplateSecretsDirectories(templatesDir);
  if (directories.length > 0) {
    logger.log('info', 'Copying ssl certificate from nginx to letsencrypt directory');
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
    }
    const nginxCert = path.join(directories[0], domain + '-bundle.crt');
    const nginxKey = path.join(directories[0], domain + '-key.pem');
    if (
      !fs.existsSync(nginxCert) && !fs.existsSync(nginxKey)
    ) {
      throw new Error(`The certificates are not found neither in letsencrypt directory: 
      ${path.join(certDir, 'fullchain.pem')} and ${letsEncryptKey}, neither in nginx secrets folder
      ${nginxCert} and ${nginxKey}`);
    }
    logger.log('info', `${nginxCert} => ${letsEncryptCert}`);
    fs.copyFileSync(nginxCert, letsEncryptCert);
    fs.copyFileSync(nginxKey, letsEncryptKey);
  }
}*/

/**
* Check if certificate is still valid for at lease 30 days

module.exports.backupCurrentCertificate = (certDir, certBackupDir) => {
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
}*/

/**
 * In case of error - return old certificate and log error

module.exports.loadOldCertificateFromBackup = (certDir, certBackupDir) => {
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
} */

/**
 * certificate may be saved in /etc/letsencrypt/live/pryv-li or /etc/letsencrypt/live/pryv-li-0001 or
 * similar directory so we will find the directory that is the last edited
 */
const getLatestSubDir = (dir) => {

  let maxTime = 0;
  let latestDir;
  const dirs = fs.readdirSync(dir, { withFileTypes: true });
  dirs.forEach(d => {
    const fullPath = path.join(dir, d.name);
    const dirData = fs.statSync(fullPath);
    const modifiedTimeMs = dirData.mtimeMs;
    if ( modifiedTimeMs > maxTime ) {
      maxTime = modifiedTimeMs;
      latestDir = fullPath;
    }
  });

  return latestDir;
  
  //return execSync(`ls -td ${dir}*/ | head -1`).toString().trim();
};
module.exports.getLatestSubDir = getLatestSubDir;

/**
 * Propagate certificates to all directories
 * in the config with name 'secret'
 * @param string certDir 
 * @param string domain
 */
module.exports.copyCertificate = (certDir, domain) => {
  logger.log('info', 'Copying ssl certificate from ' + certDir);
  const latestCertDir = module.exports.getLatestSubDir(certDir);
  const nginxSecretsDirectories = module.exports.getTemplateSecretsDirectories(templatesDir);

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
module.exports.checkCertificateInFollowers = (certDir) => {
  logger.log('info', 'Checking certificates in the followers');
  const followersSettings = JSON.parse(fs.readFileSync(config.get('leader:configPath'))).followers;
  const latestCertDir = module.exports.getLatestSubDir(certDir);
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

/**
 * Check if the followers have the same certificates
 * @param {*} certDir 
 * @param {*} certDomainDir 
 */
module.exports.checkCertificateInFollowers = (certDir) => {
  logger.log('info', 'Checking certificates in the followers');
  const followersSettings = JSON.parse(fs.readFileSync(config.get('leader:configPath'))).followers;
  const latestCertDir = module.exports.getLatestSubDir(certDir);
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