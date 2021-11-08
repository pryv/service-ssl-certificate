/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/* global it, before, describe, after */
const fs = require('fs');
const path = require('path');

const _ = require('lodash');
const nock = require('nock');
const { assert } = require('chai');
const { stub } = require('sinon');
const YAML = require('yaml');
const acme = require('acme-client');
const dns = require('dns-dig');

const { getConfig } = require('@pryv/boiler');
const renewCertificate = require('../../src/renew-certificate');
const { challengeCreateFn } = require('../../src/acme');

describe('SSL certificates renewal', () => {
  let config; 
  let leaderUrl; 
  let credentials; 
  let platformSettings;
  let domain; 
  let stubCertificate;

  before(async () => {
    config = await getConfig();
    leaderUrl = config.get('leader:url');
    credentials = fs.readFileSync(config.get('leader:credentialsPath'), 'utf-8');
    platformSettings = YAML.parse(fs.readFileSync(`${__dirname}/../fixtures/platform.yml`, 'utf-8'));
    domain = platformSettings.vars.MACHINES_AND_PLATFORM_SETTINGS.settings.DOMAIN.value;
    stubCertificate = fs.readFileSync(`${__dirname}/../fixtures/test-renew-ssl.pryv.io-bundle.crt`, 'utf-8').toString();
  });

  describe('renew-certificate', () => {
    let loginRequestBody; let isDomainFetched; let updateRequestBody; let rebootDnsBody;
    let rebootNginxBody; let acmeClientStub; let digResolveStub; let
        challenge;

    before(async () => {
      const token = 'token-for-leader';
      challenge = 'i-am-the-dns-challenge';

      acmeClientStub = stub(acme, 'Client').returns({
        auto: async () => {
          await challengeCreateFn(domain, token, platformSettings.vars, null, null, challenge);
          return stubCertificate;
        },
      });
      digResolveStub = stub(dns, 'resolveTxt').withArgs(`_acme-challenge.${domain}`);
      digResolveStub.onFirstCall().returns([]);
      digResolveStub.onSecondCall().returns([]);
      digResolveStub.onThirdCall().returns([challenge]);

      nock(leaderUrl)
        .post('/auth/login',
          (body) => {
            loginRequestBody = body;
            return true;
          })
        .reply(200, { token });
      nock(leaderUrl)
        .get('/admin/settings', () => {
          isDomainFetched = true;
          return true;
        })
        .reply(200, { settings: platformSettings.vars });
      nock(leaderUrl)
        .put('/admin/settings', (body) => {
          updateRequestBody = body;
          return true;
        })
        .reply(200, {});
      nock(leaderUrl)
        .post('/admin/notify', (body) => {
          rebootDnsBody = body;
          return true;
        })
        .reply(200, { successes: [{ url: '', role: '' }] });
      nock(leaderUrl)
        .post('/admin/notify', (body) => {
          rebootNginxBody = body;
          return true;
        })
        .reply(200, { successes: [{ url: '', role: '' }] });

      // start renewal
      await renewCertificate();
    });

    after(() => {
      removeCreatedFilesInDir(`${__dirname}/../fixtures/data/core/nginx/conf/secret/`);
      removeCreatedFilesInDir(`${__dirname}/../fixtures/data/reg-master/nginx/conf/secret`);
      removeCreatedFilesInDir(`${__dirname}/../fixtures/data/reg-slave/nginx/conf/secret`);
      removeCreatedFilesInDir(`${__dirname}/../fixtures/data/static/nginx/conf/secret`);
      function removeCreatedFilesInDir(dir) {
        fs.rmSync(path.join(dir, 'test-renew-ssl.pryv.io-bundle.crt'));
        fs.rmSync(path.join(dir, 'test-renew-ssl.pryv.io-key.pem'));
        fs.rmSync(path.join(dir, 'backup'), { recursive: true });
      }
    });

    it('must login with leader using the credentials found in the defined path', () => {
      assert.deepEqual(loginRequestBody, {
        username: 'initial_user',
        password: credentials,
      });
    });
    it('must fetch domain in settings from leader', () => {
      assert.isTrue(isDomainFetched);
    });
    it('must start the ACME procotol', () => {
      assert.equal(acmeClientStub.callCount, 1);
    });
    it('must send DNS challenge to leader', () => {
      assert.exists(updateRequestBody);
      const expectedUpdateBody = _.cloneDeep(platformSettings).vars;
      expectedUpdateBody.DNS_SETTINGS.settings.DNS_CUSTOM_ENTRIES.value['_acme-challenge'] = { description: challenge };
      assert.deepEqual(updateRequestBody, expectedUpdateBody);
    });
    it('must send order to reboot DNS services', () => {
      assert.deepEqual(rebootDnsBody, {
        services: ['pryvio_dns'],
      });
    });
    it('must verify that the DNS challenge is set', () => {
      assert.equal(digResolveStub.callCount, 3);
      for (let i = 0; i < 3; i++) {
        const call = digResolveStub.getCall(i);
        assert.deepEqual(call.args, [`_acme-challenge.${domain}`]);
        if (i === 0 || i === 1) assert.deepEqual(call.returnValue, []);
        if (i === 2) assert.deepEqual(call.returnValue, [challenge]);
      }
    });
    it('must backup old certificates', () => {
      assertFilesAreBackedUpInDir(`${__dirname}/../fixtures/data/core/nginx/conf/secret`);
      assertFilesAreBackedUpInDir(`${__dirname}/../fixtures/data/reg-master/nginx/conf/secret`);
      assertFilesAreBackedUpInDir(`${__dirname}/../fixtures/data/reg-slave/nginx/conf/secret`);
      assertFilesAreBackedUpInDir(`${__dirname}/../fixtures/data/static/nginx/conf/secret`);
      
      function assertFilesAreBackedUpInDir(dir) {
        const backupDir = path.join(dir, 'backup');
        assert.isTrue(fs.existsSync(backupDir));
        // retrieve timestamp
        const dirs = fs.readdirSync(backupDir);
        assert.isNotEmpty(dirs);
        // folder with timestamp
        const thisBackupDir = path.join(backupDir, dirs[0]);
        const certificates = fs.readdirSync(thisBackupDir, { withFileTypes: true }).filter(f => f.isFile()).map(dirent => dirent.name);
        assert.isNotEmpty(certificates);
        // here we can compare with files that are in the folder above because the new one that is written has a different name.
        for(const certFile of certificates) {
          const originalFile = path.join(dir, certFile);
          const backupFile = path.join(thisBackupDir, certFile);
          assert.deepEqual(
            fs.readFileSync(originalFile, 'utf-8'),
            fs.readFileSync(backupFile, 'utf-8'),
          );
        }
      }
    });
    it('must write certificates and keys to appropriate directories', () => {
      assertCertificatesAreWrittenInDir(`${__dirname}/../fixtures/data/core/nginx/conf/secret`);
      assertCertificatesAreWrittenInDir(`${__dirname}/../fixtures/data/reg-slave/nginx/conf/secret`);
      assertCertificatesAreWrittenInDir(`${__dirname}/../fixtures/data/reg-slave/nginx/conf/secret`);
      assertCertificatesAreWrittenInDir(`${__dirname}/../fixtures/data/static/nginx/conf/secret`);
      function assertCertificatesAreWrittenInDir(dir) {
        assert.equal(fs.readFileSync(path.join(dir, 'test-renew-ssl.pryv.io-bundle.crt'), 'utf-8'), stubCertificate);
        assert.exists(fs.readFileSync(path.join(dir, 'test-renew-ssl.pryv.io-key.pem'), 'utf-8'));
      }
    });
    it('must send order to reboot NGINX services', () => {
      assert.deepEqual(rebootNginxBody, {
        services: ['pryvio_nginx'],
      });
    });
  });
});
