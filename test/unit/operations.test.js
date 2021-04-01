const fs = require('fs');
const os = require('os');
const path = require('path');

const bluebird = require('bluebird');
const cert2json = require('cert2json');
const pem = require('pem');
const assert = require('chai').assert;
const mkdirp = require('mkdirp');
const rimraf = require('rimraf');

const config = require('../../src/config');
const { 
  isTimeToRenewCertificate,
  getTemplateSecretsDirectories,
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
      const dirs = getTemplateSecretsDirectories();
      dirs.forEach(dir => {
        const templatesDir = config.get('leader:templatesPath');
        assert.isTrue(dir.startsWith(templatesDir));
        assert.isTrue(dir.endsWith('secret'))
      })
    });
  });

});


async function genCertificate(daysToExpiration) {
  const certObject = await bluebird.fromCallback(cb => pem.createCertificate({ days: daysToExpiration}, cb))

  return certObject.certificate;
}