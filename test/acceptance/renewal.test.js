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
const { stub, createStubInstance } = require('sinon');
const YAML = require('yaml');
const acme = require('acme-client');
const dns = require('dns-dig');

const { getConfig } = require('@pryv/boiler');
const renewCertificate = require('../../src/renew-certificate');
const { challengeCreateFn } = require('../../src/acme');

describe('SSL certificates renewal', () => {
  let config, leaderUrl, credentials, platformSettings, 
      domain, stubCertificate;

  before(async () => {
    config = await getConfig();
    leaderUrl = config.get('leader:url');
    credentials = fs.readFileSync(config.get('leader:credentialsPath'), 'utf-8');
    platformSettings = YAML.parse(fs.readFileSync(__dirname + '/../fixtures/platform.yml', 'utf-8'));
    domain = platformSettings.vars.MACHINES_AND_PLATFORM_SETTINGS.settings.DOMAIN.value;
    stubCertificate = fs.readFileSync(__dirname + '/../fixtures/test-renew-ssl.pryv.io-bundle.crt', 'utf-8').toString();
  });

  describe('renew-certificate', () => {
    
    let loginRequestBody, isSettingsFetched, updateRequestBody, firstNotifyBody,
        secondNotifyBody, acmeClientStub;

    before(async () => {
      const token = 'token-for-leader';
      const challenge = 'i-am-the-dns-challenge'

      acmeClientStub = stub(acme, "Client").returns({
        auto: async () => {
          await challengeCreateFn(domain, token, platformSettings.vars, null, null, challenge);
          return stubCertificate;
        },
      });
      digResolveStub = stub(dns, "resolveTxt").withArgs('_acme-challenge.' + domain);
      digResolveStub.onFirstCall().returns([]);
      digResolveStub.onSecondCall().returns([]);
      digResolveStub.onThirdCall().returns([challenge])

      nock(leaderUrl)
        .post('/auth/login',
          (body) => {
            loginRequestBody = body;
            return true;
          })
        .reply(200, { token });
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
      nock(leaderUrl)
        .post('/admin/notify', (body) => {
          firstNotifyBody = body;
          return true;
        })
        .reply(200, { successes: [{ url: '', role: ''}]});
      nock(leaderUrl)
        .post('/admin/notify', (body) => {
          secondNotifyBody = body;
          return true;
        })
        .reply(200, { successes: [{ url: '', role: ''}]});
      
        // start renewal
      await renewCertificate();
    });

    after(() => {
      // delete newly created files
      fs.rmSync(__dirname + '/../fixtures/data/core/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt');
      fs.rmSync(__dirname + '/../fixtures/data/reg-master/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt');
      fs.rmSync(__dirname + '/../fixtures/data/reg-slave/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt');
      fs.rmSync(__dirname + '/../fixtures/data/static/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt');
      fs.rmSync(__dirname + '/../fixtures/data/core/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem');
      fs.rmSync(__dirname + '/../fixtures/data/reg-master/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem');
      fs.rmSync(__dirname + '/../fixtures/data/reg-slave/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem');
      fs.rmSync(__dirname + '/../fixtures/data/static/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem');
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
    it('must send order to reboot DNS services', () => {
      assert.deepEqual(firstNotifyBody, {
        services: ['pryvio_dns'],
      });
    });
    it('must check that the DNS challenge is set', () => {

    });
    it('must write certificates and keys to appropriate directories', () => {
      assert.equal(
        fs.readFileSync(__dirname + '/../fixtures/data/core/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt', 'utf-8'),
        stubCertificate
      );
      assert.exists(fs.readFileSync(__dirname + '/../fixtures/data/core/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem', 'utf-8'))
      assert.equal(
        fs.readFileSync(__dirname + '/../fixtures/data/reg-master/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt', 'utf-8'),
        stubCertificate
      );
      assert.exists(fs.readFileSync(__dirname + '/../fixtures/data/reg-master/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem', 'utf-8'))
      assert.equal(
        fs.readFileSync(__dirname + '/../fixtures/data/reg-slave/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt', 'utf-8'),
        stubCertificate
      );
      assert.exists(fs.readFileSync(__dirname + '/../fixtures/data/reg-slave/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem', 'utf-8'))
      assert.equal(
        fs.readFileSync(__dirname + '/../fixtures/data/static/nginx/conf/secret/test-renew-ssl.pryv.io-bundle.crt', 'utf-8'),
        stubCertificate
      );
      assert.exists(fs.readFileSync(__dirname + '/../fixtures/data/static/nginx/conf/secret/test-renew-ssl.pryv.io-key.pem', 'utf-8'))
    });
    it('must send order to reboot NGINX services', () => {
      assert.deepEqual(secondNotifyBody, {
        services: ['pryvio_nginx'],
      });
    });
  });

});