#!/usr/bin/node
const fs = require('fs');
const path = require('path');

const boiler = require('@pryv/boiler').init({
  appName: 'service-ssl-certificate',
  baseConfigDir: path.resolve(__dirname, '../config/'),
  extraConfigs: []
});

const { getLogger, getConfig } = require('@pryv/boiler');

const { 
  login,
  getSettings,
  updateSettings,
  rebootServices,
} = require('./apiCalls');

async function renewCertificate () {
  const config = await getConfig();
  const logger = getLogger('renewCertificate');
  logger.log('info', 'renewCertificate starting');

  try {
    const token = await login();
    const settings = await getSettings(token);
    // TODO start thing
    await updateSettings(token, 'i am the challenge', settings);
    await rebootServices(token, ['pryvio_dns']);

    await rebootServices(token, ['pryvio_nginx']);
  } catch (e) {
    console.log('got err', e)
  }
  
}
module.exports = renewCertificate;
