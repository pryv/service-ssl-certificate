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
const { stub } = require('sinon');

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
      assert.isTrue(await isTimeToRenewCertificate('test/mockups/rec.la/old/rec.la-bundle.crt'));
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

  describe('verifyTextRecord', () => {
    const ipAddress = '127.0.0.1';
    const key = '_acme-challenge.rec.la';
    const value = 'abc123'
    let digStub;
    before(() => {
      digStub = stub(child_process, 'execSync');
      console.log(`dig @${ipAddress} TXT +noall +answer +short ${key}`, 'waited for');
      digStub.withArgs(`dig @${ipAddress} TXT +noall +answer +short ${key}`);
      digStub.returns('"' + value + '"');
    });
    after(() => {
      digStub.restore();
    });
    it('must work', async () => {
      console.log(child_process.execSync('abc'));
      assert.isTrue(await verifyTextRecord(key, value, ipAddress, 100, 2));
    });

  });


});


async function genCertificate(daysToExpiration) {
  const certObject = await bluebird.fromCallback(cb => pem.createCertificate({ days: daysToExpiration}, cb))

  return certObject.certificate;
}