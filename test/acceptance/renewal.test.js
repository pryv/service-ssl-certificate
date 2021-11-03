/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
const fs = require('fs');
const childProcess = require('child_process');

const nock = require('nock');
const assert = require('chai').assert;
const { stub } = require('sinon');

const fixturesDir = 'test/fixtures/';
const { getConfig } = require('@pryv/boiler');
const renewCertificate = require('../../src/renew-certificate');

describe('SSL certificates renewal', () => {
  let config, leaderUrl, credentials;

  before(async () => {
    config = await getConfig();
    leaderUrl = config.get('leader:url');
    credentials = fs.readFileSync(config.get('leader:credentialsPath'), 'utf-8');
  });

  describe('When certificate is valid for the 30 days or less', () => {
    let leaderLoginRequest;
    before(async () => {
      /**
       * - setup fake creds OK
       * - setup fake leader/login call
       * - setup fake leader/getSettings
       * - setup fake leader/updateSettings
       * - setup fake leader/update-dns
       * - setup fake dig
       * - setup fake leader/update-nginx
       * - 
       *
       */
      
      nock(leaderUrl)
        .post('/auth/login',
          (body) => {
            leaderLoginRequest = body;
            return true;
          })
        .reply(200, { token: 'test-token' });
      nock(leaderUrl)
        .get('/admin/settings')
      // start renewal
      await renewCertificate();
    });

    after(() => {
      // delete newly created files
    });

    it.only('must login with leader using the credentials found in the defined path', () => {
      assert.deepEqual(leaderLoginRequest, {
        username: 'initial_user',
        password: credentials,
      });
    });
    it('must fetch settings from leader', () => {
      asset.deepEqual()
    })
  });

  describe('When the current certificate is valid for over 30 days', () => {
    after(() => {
      // delete newly created files
      deleteBackup();
      fs.rmdirSync(mockupDir + 'letsencrypt/');
    });
    it('Should not start the renewal process', async () => {
      config.set('debug:isActive', false);
      let otherCommandWasCalled = false;
      // mock execSync
      childProcess.execSync = function (command) {
        if (isCommandToGetCertificateExpirationDate(command)) {
          return 'date=' + generateFutureDate(32); // how many days certificate is valid
        } else if (isCommandToGetNginxSecretsDir(command)) {
          // mockup dir where nginx certificates exists
          return mockupDir + 'nginx-directory-with-certs';
        } else {
          otherCommandWasCalled = true;
          return '';
        }
      };
      const { renewCertificate } = requireReload('../../src/renew-certificate');
      // start renewal
      renewCertificate();
      assert.isFalse(otherCommandWasCalled, 'Should not call any other execSync command');
    });
  });
});