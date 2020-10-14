const request = require('superagent');
const fs = require('fs');

/**
 * Notify admin about new certificate to restart followers that uses the
 * certificates
 * @param {*} baseUrl
 */
exports.notifyAdmin = async (baseUrl) => {
  try {
    const token = await getLeaderAuth(baseUrl);
    console.log('Notifying admin');
    const servicesToRestart = ['pryvio_dns'];
    const res = await request.post(baseUrl + '/admin/notify')
      .set('Authorization', token)
      .send(servicesToRestart);
    return res.body;
  } catch (err) {
    console.error(err);
  }
}

async function requestToken (baseUrl, username, password) {
  console.log('Requesting the token');
  const res = await request.post(baseUrl + '/auth/login')
    .send({
      username: username,
      password: password
    });
  return res.body.token;
}

async function getLeaderAuth (baseUrl) {
  const username = 'initial_user';
  let password;
  if (fs.existsSync('/app/credentials/credentials.txt')) {
    password = fs.readFileSync('/app/credentials/credentials.txt').toString().trim();
  } else {
    throw new Error('Initial user password was not found!');
  }
  return await requestToken(baseUrl, username, password);
}