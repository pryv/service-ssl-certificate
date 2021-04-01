#! node

const cron = require('node-cron');
const { renewCertificate } = require('/app/src/renew-certificate');
const config = require('/app/src/config');

const logger = require('../src/logger').getLogger('main');

logger.log('info', 'SSL certificate renewal service started');

if (config.get('debug:isActive')) {
  logger.log('info', 'debug mode is on, running every 5min with --dry-run');
  cron.schedule('*/5 * * * *', () => {
    logger.log('info', 'Checking certificates', new Date().toISOString());
    renewCertificate();
  });
} else {
  logger.log('info', 'running every day at 01:00');
  cron.schedule(config.get('letsencrypt:cron'), () => {
    logger.log('info', 'Checking certificates', new Date().toISOString());
    renewCertificate();
  });
}

