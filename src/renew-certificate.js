#!/usr/bin/node
const fs = require('fs');
const path = require('path');

const boiler = require('@pryv/boiler').init({
  appName: 'service-ssl-certificate',
  baseConfigDir: path.resolve(__dirname, '../config/'),
  extraConfigs: []
});

const { getLogger, getConfig } = require('@pryv/boiler');

(async () => {
  await renewCertificate();
})()

async function renewCertificate () {
  const config = await getConfig();
  const logger = getLogger('renewCertificate');
  logger.log('info', 'renewCertificate starting: ' + config.get('credentials:filepath'));
}
module.exports = renewCertificate;
