const fs = require('fs');
const path = require('path');

const acme = require('acme-client');
const mkdirp = require('mkdirp');

const DOMAIN_PLACEHOLDER = 'DOMAIN';

const boiler = require('@pryv/boiler');

boiler.init({
  appName: 'service-ssl-certificate',
  baseConfigDir: path.resolve(__dirname, '../config/'),
  extraConfigs: [],
});
const { getLogger, getConfig } = require('@pryv/boiler');

const {
  login,
  getSettings,
  rebootServices,
} = require('./apiCalls');
const { challengeCreateFn } = require('./acme');

async function renewCertificate() {
  const config = await getConfig();
  const logger = getLogger('renewCertificate');
  logger.info('renewCertificate starting');

  try {
    const token = await login();
    const settings = await getSettings(token);

    const domain = settings.MACHINES_AND_PLATFORM_SETTINGS.settings.DOMAIN.value;
    const nameServerHostnames = settings.DNS_SETTINGS.settings.NAME_SERVER_ENTRIES.value.map((h) => h.name);
    logger.info(`Obtained domain: ${domain}`);
    logger.info(`Obtained name server hostnames: ${nameServerHostnames}`);
    const processNameServerHostnames = nameServerHostnames.map((hostname) => hostname.replace(DOMAIN_PLACEHOLDER, domain));
    logger.info(`Processed name server hostnames: ${processNameServerHostnames}`);

    const csrPath = config.get('acme:csrPath');
    let CSR; let
        key;
    if (csrPath != null && fs.existsSync(csrPath)) {
      CSR = fs.readFileSync(csrPath, 'utf-8').toString().trim(); // could be self genreated with acme.forge
    } else {
      [key, CSR] = await acme.forge.createCsr({
        keySize: 4096,
        commonName: `*.${domain}`,
      });
    }

    const autoOpts = {
      csr: CSR,
      email: config.get('acme:email'),
      skipChallengeVerification: config.get('acme:skipLibChallengeVerficiation'),
      termsOfServiceAgreed: true,
      challengePriority: ['dns-01'],
      challengeCreateFn: challengeCreateFn.bind(null, domain, token, settings, processNameServerHostnames),
      challengeRemoveFn: () => {},
    };
    const isProduction = config.get('acme:isProduction');
    logger.info(`Creating ACME client. For production? ${isProduction}`);

    const client = new acme.Client({
      directoryUrl: isProduction ? acme.directory.letsencrypt.production : acme.directory.letsencrypt.staging,
      accountKey: await acme.forge.createPrivateKey(), // generate an account key each time
    });
    const certificate = await client.auto(autoOpts);
    logger.info(`Obtained certificate. Length: ${certificate.length}`);

    const templateFolder = config.get('leader:templatesPath');
    const secretsFolders = generateSecretsFolder(templateFolder);
    for (const dir of secretsFolders) {
      await backupFilesInSecret(dir);
      logger.info(`Writing certificate and key to: ${dir}`);
      fs.writeFileSync(path.join(dir, `${domain}-bundle.crt`), certificate, { mode: 0o644 });
      fs.writeFileSync(path.join(dir, `${domain}-key.pem`), key, { mode: 0o644 });
    }

    const nginxServiceKey = config.get('leader:serviceKeys:nginx');
    await rebootServices(token, [nginxServiceKey]);
  } catch (e) {
    logger.error(`Error while renewing certificate: ${e}`);
    logger.error(e.stack);
  }

  function generateSecretsFolder(basePath) {
    // figure out if single node or cluster
    const dataFolders = fs.readdirSync(basePath, { withFileTypes: true }).filter((f) => f.isDirectory()).map((dirent) => dirent.name);

    const existingRoles = config.get('leader:roles');
    const roleFolders = dataFolders.filter((folder) => existingRoles.includes(folder));

    // build path for each
    const secretsFolders = [];
    for (const roleFolder of roleFolders) {
      secretsFolders.push(path.join(basePath, roleFolder, '/nginx/conf/secret'));
    }
    return secretsFolders;
  }

  async function backupFilesInSecret(basePath) {
    const filesToBackup = fs.readdirSync(basePath, { withFileTypes: true }).filter((f) => f.isFile()).map((dirent) => dirent.name);
    const backupFolder = path.join(basePath, 'backup', new Date().toISOString());
    logger.info(`Backing up files of ${basePath} into ${backupFolder}`);
    await mkdirp(backupFolder);
    for (const filename of filesToBackup) {
      const src = path.join(basePath, filename);
      const dest = path.join(backupFolder, filename);
      logger.debug(`Copying file ${src} to ${dest}`);
      fs.copyFileSync(src, dest);
    }
  }
}
module.exports = renewCertificate;
