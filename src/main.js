var cron = require('node-cron');
const { renewCertificate } = require('/app/src/renew-certificate');
const { config } = require('/app/src/config');


if (config.debug) {
  cron.schedule('*/5 * * * *', () => {
    console.log('Checking certificates', new Date().toISOString());
    renewCertificate();
  });
} else {
  cron.schedule('0 1 * * *', () => {
    console.log('Checking certificates', new Date().toISOString());
    renewCertificate();
  });
}

