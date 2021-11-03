/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
const fs = require('fs');

const _ = require('lodash');
const nock = require('nock');
const assert = require('chai').assert;
const { stub } = require('sinon');
const YAML = require('yaml');

const fixturesDir = 'test/fixtures/';
const { getConfig } = require('@pryv/boiler');
const renewCertificate = require('../../src/renew-certificate');

describe('SSL certificates renewal', () => {
  let config, leaderUrl, credentials, platformSettings;

  before(async () => {
    config = await getConfig();
    leaderUrl = config.get('leader:url');
    credentials = fs.readFileSync(config.get('leader:credentialsPath'), 'utf-8');
    platformSettings = YAML.parse(fs.readFileSync(__dirname + '/../fixtures/platform.yml', 'utf-8'));
  });

  describe.only('When certificate is valid for the 30 days or less', () => {
    let loginRequestBody, isSettingsFetched, updateRequestBody;
    before(async () => {
      /**
       * - setup fake creds OK
       * - setup fake leader/login call
       * - make first acme thing
       * - setup fake leader/getSettings
       * - setup fake leader/updateSettings
       * - setup fake leader/update-dns
       * - setup fake dig
       * - setup fake leader/update-nginx
       * http://leader:8080/admin/settings
       * http://leader:8080/admin/settings
       *
       */
      console.log('setting mock for', leaderUrl)
      nock(leaderUrl)
        .post('/auth/login',
          (body) => {
            loginRequestBody = body;
            return true;
          })
        .reply(200, { token: 'test-token' });
      nock(leaderUrl)
        .get('/admin/settings', () => {
          isSettingsFetched = true;
          return true;
        })
        .reply(200, { settings: platformSettings.vars });
      nock(leaderUrl)
        .put('/admin/settings', (body) => {
          updateRequestBody = body;
          return true;
        })
        .reply(200, {});
      // start renewal
      await renewCertificate();
    });

    after(() => {
      // delete newly created files
    });

    it('must login with leader using the credentials found in the defined path', () => {
      assert.deepEqual(loginRequestBody, {
        username: 'initial_user',
        password: credentials,
      });
    });
    it('must fetch settings from leader', () => {
      assert.isTrue(isSettingsFetched);
    });
    it('must send DNS challenge to leader', () => {
      assert.exists(updateRequestBody);
      const challenge = updateRequestBody.DNS_SETTINGS.settings.DNS_CUSTOM_ENTRIES.value['_acme-challenge'];
      const expectedUpdateBody = _.cloneDeep(platformSettings).vars;
      expectedUpdateBody.DNS_SETTINGS.settings.DNS_CUSTOM_ENTRIES.value['_acme-challenge'] = challenge;
      assert.deepEqual(updateRequestBody, expectedUpdateBody);
    });
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