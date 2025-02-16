/**
 * @license
 * Copyright (C) Pryv S.A. https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
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
  let nameServerHostnames;
  let dnsServiceKey;
  let nginxServiceKey;

  before(async () => {
    config = await getConfig();
    leaderUrl = config.get('leader:url');
    credentials = fs.readFileSync(config.get('leader:credentialsPath'), 'utf-8');
    platformSettings = YAML.parse(fs.readFileSync(fixture('platform.yml'), 'utf-8'));
    domain = platformSettings.vars.MACHINES_AND_PLATFORM_SETTINGS.settings.DOMAIN.value;
    stubCertificate = fs.readFileSync(fixture('test-renew-ssl.pryv.io-bundle.crt'), 'utf-8').toString();
    nameServerHostnames = platformSettings.vars.DNS_SETTINGS.settings.NAME_SERVER_ENTRIES.value.map((hostname) => hostname.name.replace('DOMAIN', domain));
    dnsServiceKey = config.get('leader:serviceKeys:dns');
    nginxServiceKey = config.get('leader:serviceKeys:nginx');
  });

  describe('renew-certificate', () => {
    let loginRequestBody; let isDomainFetched; let updateRequestBody; let rebootDnsBody;
    let rebootNginxBody; let acmeClientStub; let digResolveStub;
    let challenge;

    before(async () => {
      const token = 'token-for-leader';
      challenge = 'i-am-the-dns-challenge';

      acmeClientStub = stub(acme, 'Client').returns({
        auto: async () => {
          await challengeCreateFn(domain, token, platformSettings.vars, nameServerHostnames, null, null, challenge);
          return stubCertificate;
        }
      });
      digResolveStub = stub(dns, 'resolveTxt');
      digResolveStub.withArgs(`_acme-challenge.${domain}`, { host: nameServerHostnames[0] }).onFirstCall().returns([]);
      digResolveStub.withArgs(`_acme-challenge.${domain}`, { host: nameServerHostnames[0] }).onSecondCall().returns([]);
      digResolveStub.withArgs(`_acme-challenge.${domain}`, { host: nameServerHostnames[0] }).onThirdCall().returns([challenge]);
      digResolveStub.withArgs(`_acme-challenge.${domain}`, { host: nameServerHostnames[1] }).onFirstCall().returns([]);
      digResolveStub.withArgs(`_acme-challenge.${domain}`, { host: nameServerHostnames[1] }).onSecondCall().returns([challenge]);

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
      removeCreatedFilesInDir(fixture('data/core/nginx/conf/secret/'));
      removeCreatedFilesInDir(fixture('data/reg-master/nginx/conf/secret'));
      removeCreatedFilesInDir(fixture('data/reg-slave/nginx/conf/secret'));
      removeCreatedFilesInDir(fixture('data/static/nginx/conf/secret'));
      function removeCreatedFilesInDir (dir) {
        fs.rmSync(path.join(dir, 'test-renew-ssl.pryv.io-bundle.crt'));
        fs.rmSync(path.join(dir, 'test-renew-ssl.pryv.io-key.pem'));
        fs.rmSync(path.join(dir, 'backup'), { recursive: true });
      }
    });

    it('must login with leader using the credentials found in the defined path', () => {
      assert.deepEqual(loginRequestBody, {
        username: 'initial_user',
        password: credentials
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
        services: [dnsServiceKey]
      });
    });
    it('must verify that the DNS challenge is set', () => {
      assert.equal(digResolveStub.callCount, 5);

      let firstCalled = 0;
      let secondCalled = 0;
      for (let i = 0; i < 5; i++) {
        const { args, returnValue } = digResolveStub.getCall(i);
        assert.deepEqual(args[0], `_acme-challenge.${domain}`);
        if (args[1].host === nameServerHostnames[0]) {
          if (firstCalled === 0 || firstCalled === 1) assert.deepEqual(returnValue, []);
          if (firstCalled === 2) assert.deepEqual(returnValue, [challenge]);
          firstCalled++;
        } else if (args[1].host === nameServerHostnames[1]) {
          if (secondCalled === 0) assert.deepEqual(returnValue, []);
          if (secondCalled === 1) assert.deepEqual(returnValue, [challenge]);
          secondCalled++;
        }
      }
      assert.equal(firstCalled, 3);
      assert.equal(secondCalled, 2);
    });
    it('must backup old certificates', () => {
      assertFilesAreBackedUpInDir(fixture('data/core/nginx/conf/secret'));
      assertFilesAreBackedUpInDir(fixture('data/reg-master/nginx/conf/secret'));
      assertFilesAreBackedUpInDir(fixture('data/reg-slave/nginx/conf/secret'));
      assertFilesAreBackedUpInDir(fixture('data/static/nginx/conf/secret'));

      function assertFilesAreBackedUpInDir (dir) {
        const backupDir = path.join(dir, 'backup');
        assert.isTrue(fs.existsSync(backupDir));
        // retrieve timestamp
        const dirs = fs.readdirSync(backupDir);
        assert.isNotEmpty(dirs);
        // folder with timestamp
        const thisBackupDir = path.join(backupDir, dirs[0]);
        const certificates = fs.readdirSync(thisBackupDir, { withFileTypes: true }).filter((f) => f.isFile()).map((dirent) => dirent.name);
        assert.isNotEmpty(certificates);
        // here we can compare with files that are in the folder above because the new one that is written has a different name.
        for (const certFile of certificates) {
          const originalFile = path.join(dir, certFile);
          const backupFile = path.join(thisBackupDir, certFile);
          assert.deepEqual(
            fs.readFileSync(originalFile, 'utf-8'),
            fs.readFileSync(backupFile, 'utf-8')
          );
        }
      }
    });
    it('must write certificates and keys to appropriate directories', () => {
      assertCertificatesAreWrittenInDir(fixture('data/core/nginx/conf/secret'));
      assertCertificatesAreWrittenInDir(fixture('data/reg-slave/nginx/conf/secret'));
      assertCertificatesAreWrittenInDir(fixture('data/reg-slave/nginx/conf/secret'));
      assertCertificatesAreWrittenInDir(fixture('data/static/nginx/conf/secret'));
      function assertCertificatesAreWrittenInDir (dir) {
        assert.equal(fs.readFileSync(path.join(dir, 'test-renew-ssl.pryv.io-bundle.crt'), 'utf-8'), stubCertificate);
        assert.exists(fs.readFileSync(path.join(dir, 'test-renew-ssl.pryv.io-key.pem'), 'utf-8'));
      }
    });
    it('must send order to reboot NGINX services', () => {
      assert.deepEqual(rebootNginxBody, {
        services: [nginxServiceKey]
      });
    });
  });
});

function fixture (subPath) {
  return path.join(__dirname, '../fixtures', subPath);
}
