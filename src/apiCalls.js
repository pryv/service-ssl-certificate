const request = require('superagent');
const fs = require('fs');

/**
 * Notify admin about new certificate to restart followers that uses the
 * certificates
 * @param {*} baseUrl
 */
exports.notifyAdmin = async (baseUrl, servicesToRestart) => {
  try {
    const token = await loginLeader(baseUrl);
    console.log('Notifying admin');
    const res = await request.post(baseUrl + '/admin/notify')
      .set('Authorization', token)
      .send(servicesToRestart);
    return res.body;
  } catch (err) {
    console.error(err);
  }
}

async function loginLeader (baseUrl) {
  const USERNAME = 'initial_user';
  let password;
  
  const credentialsPath = (process.env.INIT_USER_CREDENTIALS) ? process.env.INIT_USER_CREDENTIALS : '/app/credentials/credentials.txt';
  if (fs.existsSync(credentialsPath)) {
    password = fs.readFileSync(credentialsPath).toString().trim();
  } else {
    throw new Error('Initial user password was not found!');
  }
  return await requestToken(baseUrl, username, password);

  async function requestToken (baseUrl, username, password) {
    console.log('Requesting the token');
    const res = await request.post(baseUrl + '/auth/login')
      .send({
        username: username,
        password: password
      });
    return res.body.token;
  }
}
