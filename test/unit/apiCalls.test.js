const url = require('url');

const nock = require('nock');
const assert = require('chai').assert;

const { 
  setDnsRecord
} = require('../../src/apiCalls');

describe('apiCalls', () => {

  const registerUrl = 'http://whatever';
  const methodPath = '/admin/records';
  const fullUrl = url.resolve(registerUrl, methodPath);
  const dnsRecord = {'_acme-challenge': { description: '123' } };

  describe('setDnsRecord', () => {

    let bodyRequest;

    before(() => {
      nock(registerUrl)
        .post(methodPath,
          (body) => {
            bodyRequest = body;
            return true;
          })
        .reply(200, { token: 'test-token' });
    });
    it('must make the correct request to Register', async () => {
      const res = await setDnsRecord(dnsRecord, fullUrl);
      assert.equal(res.status, 200);
      assert.deepEqual(bodyRequest, dnsRecord);
    });
  });
});