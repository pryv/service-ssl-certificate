var cron = require('node-cron');
const { renewCertificate } = require('/app/src/renew-certificate');
const { config } = require('/app/src/config');

const logger = require('./logger').getLogger('main');

if (config.debug) {
  cron.schedule('*/5 * * * *', () => {
    logger.log('info', 'Checking certificates', new Date().toISOString());
    renewCertificate();
  });
} else {
  cron.schedule('0 1 * * *', () => {
    logger.log('info', 'Checking certificates', new Date().toISOString());
    renewCertificate();
  });
}

