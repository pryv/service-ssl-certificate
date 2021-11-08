/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/* global it, before, describe, after */
const fs = require('fs');

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
  let config; let leaderUrl; let credentials; let platformSettings;
  let domain; let
      stubCertificate;

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
      // delete newly created files
      fs.rmSync(`${__dirname}/../fixtures/data/core/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt`);
      fs.rmSync(`${__dirname}/../fixtures/data/reg-master/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt`);
      fs.rmSync(`${__dirname}/../fixtures/data/reg-slave/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt`);
      fs.rmSync(`${__dirname}/../fixtures/data/static/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt`);
      fs.rmSync(`${__dirname}/../fixtures/data/core/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem`);
      fs.rmSync(`${__dirname}/../fixtures/data/reg-master/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem`);
      fs.rmSync(`${__dirname}/../fixtures/data/reg-slave/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem`);
      fs.rmSync(`${__dirname}/../fixtures/data/static/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem`);
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
    it('must write certificates and keys to appropriate directories', () => {
      assert.equal(
        fs.readFileSync(`${__dirname}/../fixtures/data/core/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt`, 'utf-8'),
        stubCertificate,
      );
      assert.exists(fs.readFileSync(`${__dirname}/../fixtures/data/core/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem`, 'utf-8'));
      assert.equal(
        fs.readFileSync(`${__dirname}/../fixtures/data/reg-master/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt`, 'utf-8'),
        stubCertificate,
      );
      assert.exists(fs.readFileSync(`${__dirname}/../fixtures/data/reg-master/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem`, 'utf-8'));
      assert.equal(
        fs.readFileSync(`${__dirname}/../fixtures/data/reg-slave/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt`, 'utf-8'),
        stubCertificate,
      );
      assert.exists(fs.readFileSync(`${__dirname}/../fixtures/data/reg-slave/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem`, 'utf-8'));
      assert.equal(
        fs.readFileSync(`${__dirname}/../fixtures/data/static/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt`, 'utf-8'),
        stubCertificate,
      );
      assert.exists(fs.readFileSync(`${__dirname}/../fixtures/data/static/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem`, 'utf-8'));
    });
    it('must send order to reboot NGINX services', () => {
      assert.deepEqual(rebootNginxBody, {
        services: ['pryvio_nginx'],
      });
    });
  });
});
