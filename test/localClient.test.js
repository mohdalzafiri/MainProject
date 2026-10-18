const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createLocalClientApp, verifyCentralServer } = require('../local-client');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test('serves local files and proxies API requests to the central server', async () => {
  let proxiedRequest;
  const centralServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      proxiedRequest = {
        method: req.method,
        url: req.url,
        origin: req.headers.origin,
        body: Buffer.concat(chunks).toString('utf8')
      };
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', source: 'central' }));
    });
  });
  const centralAddress = await listen(centralServer);
  const centralServerUrl = `http://127.0.0.1:${centralAddress.port}`;
  const localServer = createLocalClientApp({ centralServerUrl }).listen(0, '127.0.0.1');
  await new Promise((resolve) => localServer.once('listening', resolve));

  try {
    const localAddress = localServer.address();
    const localUrl = `http://127.0.0.1:${localAddress.port}`;
    const loginResponse = await fetch(`${localUrl}/login.html`);
    assert.equal(loginResponse.status, 200);
    assert.match(await loginResponse.text(), /<title>تسجيل الدخول<\/title>/);

    const apiResponse = await fetch(`${localUrl}/api/example?value=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true })
    });
    assert.equal(apiResponse.status, 200);
    assert.deepEqual(await apiResponse.json(), { status: 'ok', source: 'central' });
    assert.deepEqual(proxiedRequest, {
      method: 'POST',
      url: '/api/example?value=1',
      origin: centralServerUrl,
      body: JSON.stringify({ test: true })
    });
  } finally {
    await close(localServer);
    await close(centralServer);
  }
});

test('verifies central server health before local startup', async () => {
  const centralServer = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok' }));
  });
  const centralAddress = await listen(centralServer);

  try {
    await assert.doesNotReject(
      verifyCentralServer(`http://127.0.0.1:${centralAddress.port}`)
    );
  } finally {
    await close(centralServer);
  }
});
