var cron = require('node-cron');
const { renewCertificate } = require('/app/src/renew-certificate');

cron.schedule('0 1 * * *', () => {
  console.log('Checking certificates', new Date().toISOString());
  renewCertificate();
});