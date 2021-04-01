
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const bluebird = require('bluebird');
const pem = require('pem');

const parseCertificate = bluebird.promisify(pem.readCertificateInfo);

const config = require('./config');
const logger = require('./logger').getLogger('operations');

/**
 * Returns fullpath to directories containing directory named "secret".
 */
const getTemplateSecretsDirectories = () => {
  const templatesDir = config.get('leader:templatesPath');

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
 * For the first time in systems that already have the certificate,
 * they will exist only in the nginx config. Copy them to letsencrypt folder
 */
module.exports.copyCertificatesFromNginxIfNeeded = (certDir, domain) => {
  if (fs.existsSync(path.join(certDir, 'fullchain.pem')) &&
      fs.existsSync(path.join(certDir, 'privkey.pem'))) {
    return;
  }
  const directories = module.exports.getTemplateSecretsDirectories();
  if (directories.length > 0) {
    logger.log('info', 'Copying ssl certificate from nginx to letsencrypt directory');
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
    }
    if (
      !fs.existsSync(path.join(directories[0], domain + '-bundle.crt')) &&
      !fs.existsSync(path.join(directories[0], domain + '-key.pem'))
    ) {
      throw new Error(`The certificates are not found neither in letsencrypt directory: 
      ${path.join(certDir, 'fullchain.pem')} and ${path.join(certDir, 'privkey.pem')}, neither in nginx secrets folder
      ${path.join(directories[0], domain + '-bundle.crt')} and ${path.join(directories[0], domain + '-key.pem')}`);
    }
    logger.log('info', `${path.join(directories[0], domain + '-bundle.crt')} => ${path.join(certDir, 'fullchain.pem')}`);
    fs.copyFileSync(path.join(directories[0], domain + '-bundle.crt'), path.join(certDir, 'fullchain.pem'));
    fs.copyFileSync(path.join(directories[0], domain + '-key.pem'), path.join(certDir, 'privkey.pem'));
  }
}

/**
* Check if certificate is still valid for at lease 30 days
*/
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
}

/**
 * In case of error - return old certificate and log error
 */
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
}

/**
 * certificate may be saved in /etc/letsencrypt/live/pryv-li or /etc/letsencrypt/live/pryv-li-0001 or
 * similar directory so we will find the directory that is the last edited
 */
const getLatestSubDir = (dir) => {
  
  return execSync(`ls -td ${dir}*/ | head -1`).toString().trim();
};
module.exports.getLatestSubDir;

/**
 * Propagate certificates to all directories
 * in the config with name 'secret'
 * @param string certDir 
 * @param string domain
 */
module.exports.copyCertificate = (certDir, domain) => {
  logger.log('info', 'Copying ssl certificate from ' + certDir);
  const latestCertDir = getLatestSubDir(certDir);
  const nginxSecretsDirectories = module.exports.getTemplateSecretsDirectories();

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

/**
 * Check if the followers have the same certificates
 * @param {*} certDir 
 * @param {*} certDomainDir 
 */
module.exports.checkCertificateInFollowers = (certDir) => {
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