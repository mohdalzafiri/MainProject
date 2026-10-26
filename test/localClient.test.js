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
    assert.equal(loginResponse.headers.get('cache-control'), 'no-store, no-cache, must-revalidate');
    assert.match(await loginResponse.text(), /<title>تسجيل الدخول<\/title>/);

    const mobileHolidaysResponse = await fetch(`${localUrl}/mobile/holidays.html`);
    assert.equal(mobileHolidaysResponse.status, 200);
    assert.equal(mobileHolidaysResponse.headers.get('cache-control'), 'no-store, no-cache, must-revalidate');
    const mobileHolidaysHtml = await mobileHolidaysResponse.text();
    assert.match(mobileHolidaysHtml, /<input id="name" type="text"/);
    assert.doesNotMatch(mobileHolidaysHtml, /<select id="name"/);

    const departmentMailResponse = await fetch(`${localUrl}/department-mail.html`);
    assert.equal(departmentMailResponse.status, 200);
    const departmentMailHtml = await departmentMailResponse.text();
    assert.match(departmentMailHtml, /<title>بريد الأقسام والنوبات<\/title>/);
    assert.match(departmentMailHtml, /id="dailyScanCanvas"/);
    assert.match(departmentMailHtml, /department-mail-scans/);

    const mobileDepartmentMailResponse = await fetch(`${localUrl}/mobile/department-mail.html`);
    assert.equal(mobileDepartmentMailResponse.status, 200);
    assert.match(await mobileDepartmentMailResponse.text(), /id="departmentMailForm"/);

    const settingsResponse = await fetch(`${localUrl}/settings.html`);
    assert.equal(settingsResponse.status, 200);
    const settingsHtml = await settingsResponse.text();
    assert.match(settingsHtml, /\{ key: 'departmentMail', label: 'بريد الأقسام' \}/);
    assert.match(settingsHtml, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
    assert.doesNotMatch(settingsHtml, /id="subSectionPermissions"/);

    const dailyResponse = await fetch(`${localUrl}/daily.html`);
    assert.equal(dailyResponse.status, 200);
    const dailyHtml = await dailyResponse.text();
    assert.match(dailyHtml, /MainProjectStatusCatalog\.statuses/);
    assert.match(dailyHtml, /MainProjectStatusCatalog\.getAdjustedTimes/);

    const mobileDailyResponse = await fetch(`${localUrl}/mobile/daily.html`);
    assert.equal(mobileDailyResponse.status, 200);
    const mobileDailyHtml = await mobileDailyResponse.text();
    assert.match(mobileDailyHtml, /MainProjectStatusCatalog\.statuses/);
    assert.match(mobileDailyHtml, /MainProjectStatusCatalog\.getAdjustedTimes/);

    const statusCatalogResponse = await fetch(`${localUrl}/status-catalog.js`);
    assert.equal(statusCatalogResponse.status, 200);
    assert.match(await statusCatalogResponse.text(), /'أذن'/);

    const mobileProfileResponse = await fetch(`${localUrl}/mobile-profile.html`);
    assert.equal(mobileProfileResponse.status, 200);
    const mobileProfileHtml = await mobileProfileResponse.text();
    assert.match(mobileProfileHtml, /id="profileRankSummary"/);
    assert.doesNotMatch(mobileProfileHtml, /id="profileRank"/);
    assert.match(mobileProfileHtml, /id="profileJobTitle"/);

    const faviconResponse = await fetch(`${localUrl}/favicon.ico`);
    assert.equal(faviconResponse.status, 200);
    assert.equal(faviconResponse.headers.get('content-type'), 'image/x-icon');
    assert.ok((await faviconResponse.arrayBuffer()).byteLength > 0);

    const forceListResponse = await fetch(`${localUrl}/force-list.html`);
    assert.equal(forceListResponse.status, 200);
    assert.match(await forceListResponse.text(), /id="folderTitle"/);

    const legacyMobileDashboardResponse = await fetch(`${localUrl}/mobile/dashboard.html`, {
      redirect: 'manual'
    });
    assert.equal(legacyMobileDashboardResponse.status, 302);
    assert.equal(legacyMobileDashboardResponse.headers.get('location'), '/mobile-dashboard.html');

    const mobileRootResponse = await fetch(`${localUrl}/mobile`, {
      redirect: 'manual'
    });
    assert.equal(mobileRootResponse.status, 302);
    assert.equal(mobileRootResponse.headers.get('location'), '/mobile-dashboard.html');

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
