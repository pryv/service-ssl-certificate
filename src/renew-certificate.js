const fs = require('fs');
const path = require('path');

const acme = require('acme-client');

require('@pryv/boiler').init({
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
    logger.info(`obtained domain: ${domain}`);

    const csrPath = config.get('acme:csrPath');
    let CSR; let
        key;
    if (csrPath != null && fs.existsSync(csrPath)) {
      CSR = fs.readFileSync(csrPath, 'utf-8').toString().trim(); // could be self genreated with acme.forge
    } else {
      [key, CSR] = await acme.forge.createCsr({
        keySize: 4096,
        commonName: domain,
      });
    }

    const autoOpts = {
      csr: CSR,
      email: config.get('acme:email'),
      termsOfServiceAgreed: true,
      challengePriority: ['dns-01'],
      challengeCreateFn: challengeCreateFn.bind(null, domain, token, settings),
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
    const writeCsrDestinations = generateWriteDestinations(templateFolder, domain, `${domain}-bundle.crt`);
    for (const d of writeCsrDestinations) {
      logger.info(`Writing certificate to: ${d}`);
      fs.writeFileSync(d, certificate);
    }
    const writeKeyDestinations = generateWriteDestinations(templateFolder, domain, `${domain}-key.pem`);
    for (const d of writeKeyDestinations) {
      logger.info(`Writing key to: ${d}`);
      fs.writeFileSync(d, key);
    }

    await rebootServices(token, ['pryvio_nginx']);
  } catch (e) {
    logger.error(`Error while renewing certificate: ${e}`);
  }
}
module.exports = renewCertificate;

function generateWriteDestinations(basePath, domain, filename) {
  // figure out if single node or cluster
  const roleFolders = fs.readdirSync(basePath, { withFileTypes: true }).filter((f) => f.isDirectory());

  // build path for each
  const destinations = [];
  for (const roleFolder of roleFolders) {
    destinations.push(path.join(basePath, roleFolder.name, `/nginx/conf/secret/${filename}`));
  }
  return destinations;
}
