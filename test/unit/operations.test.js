const fs = require('fs');
const os = require('os');
const path = require('path');
const child_process = require('child_process');

const bluebird = require('bluebird');
const cert2json = require('cert2json');
const pem = require('pem');
const assert = require('chai').assert;
const mkdirp = require('mkdirp');
const rimraf = require('rimraf');
const { stub, spy } = require('sinon');
const getSslCertificate = require('get-ssl-certificate');

const config = require('../../src/config');
const { 
  isTimeToRenewCertificate,
  getTemplateSecretsDirectories,
  verifyTextRecord,
} = require('../../src/operations');

describe('operations', () => {

  let baseDir;
  before(() => {
    baseDir = path.join(os.tmpdir(), 'service-ssl-tests');
    mkdirp.sync(baseDir);
  });
  after(() => {
    rimraf.sync(baseDir);
  });

  describe('isTimeToRenewCertificate()', () => {
    it('must return true if the certificate has expired', async () => {
      assert.isTrue(await isTimeToRenewCertificate('test/fixtures/rec.la/old/rec.la-bundle.crt'));
    });
    it('must return true if it expires after less than 30 days', async () => {
      const cert = await genCertificate(15);
      const fileName = path.join(baseDir, 'less-than-30.pem');
      fs.writeFileSync(fileName, cert);
      assert.isTrue(await isTimeToRenewCertificate(fileName));
    });
    it('must return true if it expires after 30 days', async () => {
      const cert = await genCertificate(30);
      const fileName = path.join(baseDir, '30.pem');
      fs.writeFileSync(fileName, cert);
      assert.isTrue(await isTimeToRenewCertificate(fileName));
    });
    it('must return false if it expires after more than 30 days', async () => {
      const cert = await genCertificate(31);
      const fileName = path.join(baseDir, '31.pem');
      fs.writeFileSync(fileName, cert);
      assert.isFalse(await isTimeToRenewCertificate(fileName));
    });
  });

  describe('getTemplateSecretsDirectories()', () => {
    it('must return the directories with a secrets folder', async () => {
      const templatesDir = config.get('leader:templatesPath');
      const dirs = getTemplateSecretsDirectories(templatesDir);
      dirs.forEach(dir => {
        
        assert.isTrue(dir.startsWith(templatesDir));
        assert.isTrue(dir.endsWith('secret'))
      })
    });
  });

  describe('verifyTextRecord()', () => {
    const ipAddress = '127.0.0.1';
    const key = '_acme-challenge.rec.la';
    const value = 'abc123'
    const timeoutMs = 100;
    const retryRateMs = 2;
    let digStub;
    describe('when the value is set', () => {
      before(() => {
        digStub = stub(child_process, 'execSync');
        digStub.withArgs(`dig @${ipAddress} TXT +noall +answer +short ${key}`);
        digStub.returns('"' + value + '"');
      });
      after(() => {
        digStub.restore();
      });
      it('returns true after being called once', async () => {
        assert.isTrue(await verifyTextRecord(key, value, ipAddress, timeoutMs, retryRateMs));
        assert.isTrue(digStub.calledOnce);
      });
    });
    describe('when the value is not set', () => {
      before(() => {
        digStub = stub(child_process, 'execSync');
        digStub.withArgs(`dig @${ipAddress} TXT +noall +answer +short ${key}`);
        digStub.returns('"something-else"');
      });
      after(() => {
        digStub.restore();
      });
      it('throws an error after a timeout after calling it multiple times', async () => {
        try {
          await verifyTextRecord(key, value, ipAddress, timeoutMs, retryRateMs)
          assert.fail('should have thrown');
        } catch (e) {
          assert.exists(e);
          assert.include(e.message, 'Timeout: DNS check invalid after ' + timeoutMs + 'ms');
          assert.isAbove(digStub.callCount, 1);
        }
      });
    });

  });

  describe('validateCertificateDeployed()', () => {
    let getSslCertificateStub;
    before(() => {
      getSslCertificateStub = stub(getSslCertificate);
    });
    describe('when all hosts deployed it', () => {
      
    });
    describe('when a host did not deploy it', () => {

    });
    
  });


});


async function genCertificate(daysToExpiration) {
  const certObject = await bluebird.fromCallback(cb => pem.createCertificate({ days: daysToExpiration}, cb))

  return certObject.certificate;
}