/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
const fs = require('fs');
const nock = require('nock');
const chai = require('chai');
const assert = chai.assert;
let childProcess = require('child_process');
const mockupDir = './tests/mockups/';

/**
 * Helper to form string date how long the certificate is valid
 * @param {*} days 
 */
function generateFutureDate (days) {
  const dateAfterMonth = new Date();
  dateAfterMonth.setDate(new Date().getDate() + days);
  return dateAfterMonth.toISOString().split('T')[0];
}

function isCommandToGetCertificateExpirationDate (command) {
  return command.includes('openssl x509 -enddate -noout ');
}

function isCommandToGetNginxSecretsDir (command) {
  return command.includes('echo | find /app/data -name');
}

function isCommandToGetLetsencryptDir (command) {
  return command.includes(`ls -td ${mockupDir}letsencrypt/pryv.li*/ | head -1`);
}

function isCommandToGetPartOfCertificate (command) {
  return command.includes('echo | openssl s_client -servername');
}

var requireReload = function (modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
};

/**
 * First parameter is command passed to execSync and the second parameter
 * is number of days how long certificate should be valid
 * 
 * @param {string} command 
 * @param {integer} days 
 */
function execSyncMock (command, days) {
  if (isCommandToGetCertificateExpirationDate(command)) {

    return 'date=' + generateFutureDate(days) ; // how many days certificate is valid
  } else if (isCommandToGetNginxSecretsDir(command)) {

    // mockup dir where nginx certificates exists
    return mockupDir + 'nginx-directory-with-certs';
  } else if (isCommandToGetLetsencryptDir(command)) {

    // mockup dir where letsencrypt would save the certificates
    return mockupDir + 'letsencrypt/pryv.li/';
  } else if (isCommandToGetPartOfCertificate(command)) {

    return 'fullchain-contentEND CERTIFICATE-----';
  } else {
    
    // when response of execSync is not important
    return 'test';
  }
}

function getFullChainFilePath () {
  return 'letsencrypt/pryv.li/fullchain.pem';
}

function getPrivKeyFilePath () {
  return 'letsencrypt/pryv.li/privkey.pem';
}

function deleteBackup () {
  console.log('Cleaning after test', mockupDir + 'letsencrypt/');
  fs.unlinkSync(mockupDir + getFullChainFilePath());
  fs.unlinkSync(mockupDir + getPrivKeyFilePath());
  fs.rmdirSync(mockupDir + 'letsencrypt/pryv.li/');
}

describe('SSL certificates renewal', () => {
  let adminLeaderLoginRequest;
  let adminLeaderNotifyRequest;
  describe('When certificate is valid for the 30 days or less', async () => {
    before(async () => {
      // mock execSync
      childProcess.execSync = function (command) {
        return execSyncMock(command, 30);
      };
      requireReload('../../src/config');
      const { renewCertificate } = requireReload('../../src/renew-certificate');
      nock('https://lead.pryv.li')
        .post('/auth/login',
          (body) => {
            adminLeaderLoginRequest = body;
            return true;
          })
        .reply(200, { token: 'test-token' });
      
      nock('https://lead.pryv.li')
        .post('/admin/notify',
          (body) => {
            adminLeaderNotifyRequest = body;
            return true;
          })
        .reply(200, '');
      
      // start renewal
      await renewCertificate();
    });

    after(() => {
      // delete newly created files
      deleteBackup();
      fs.unlinkSync(mockupDir + 'letsencrypt/tmp/pryv.li/fullchain.pem');
      fs.unlinkSync(mockupDir + 'letsencrypt/tmp/pryv.li/privkey.pem');
      fs.rmdirSync(mockupDir + 'letsencrypt/tmp/pryv.li/');
      fs.rmdirSync(mockupDir + 'letsencrypt/tmp/');

      fs.rmdirSync(mockupDir + 'letsencrypt/');
    });

    it('Should copy certificate to letsencrypt dir from nginx dir', () => {
      assert.isTrue(fs.existsSync(mockupDir + getFullChainFilePath()));
      assert.isTrue(fs.existsSync(mockupDir + getPrivKeyFilePath()));
    });
    it('Should backup certificate', () => {
      assert.isTrue(fs.existsSync(mockupDir + 'letsencrypt/tmp/pryv.li/fullchain.pem'));
      assert.isTrue(fs.existsSync(mockupDir + 'letsencrypt/tmp/pryv.li/privkey.pem'));
    });
    it('Should read password from credentials file', () => {
      assert.deepEqual(adminLeaderLoginRequest, { username: 'initial_user', password: 'abc' });
    });
    it('Should ask to notify nginx service', () => {
      assert.deepEqual(adminLeaderNotifyRequest, ['pryvio_nginx']);
    });
  });

  describe('When the current certificate is valid for over 30 days', () => {
    after(() => {
      // delete newly created files
      deleteBackup();
      fs.rmdirSync(mockupDir + 'letsencrypt/');
    });
    it('Should not start the renewal process', async () => {
      process.env.DEBUG = false;
      let otherCommandWasCalled = false;
      // mock execSync
      childProcess.execSync = function (command) {
        if (isCommandToGetCertificateExpirationDate(command)) {
          return 'date=' + generateFutureDate(31); // how many days certificate is valid
        } else if (isCommandToGetNginxSecretsDir(command)) {
          // mockup dir where nginx certificates exists
          return mockupDir + 'nginx-directory-with-certs';
        } else {
          otherCommandWasCalled = true;
          return '';
        }
      };
      requireReload('../../src/config');
      const { renewCertificate } = requireReload('../../src/renew-certificate');
      // start renewal
      renewCertificate();
      assert.isFalse(otherCommandWasCalled, 'Should not call any other execSync command');
    });
  });
});