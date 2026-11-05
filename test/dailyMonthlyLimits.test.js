const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const express = require('express');
const Database = require('better-sqlite3');
const root = path.join(__dirname, '..');

test('monthly daily limits allow writes and keep warnings in desktop and mobile', async () => {
  const db = new Database(':memory:');
  const tables = ['Daily1', 'Daily2', 'Daily3', 'Daily4'];
  for (const table of tables) db.exec(`CREATE TABLE ${table} (ID INTEGER PRIMARY KEY, EmpID TEXT,
    Day TEXT, Today TEXT, Name TEXT, Department TEXT, Section TEXT, Status TEXT, Period TEXT,
    InTime TEXT, OutTime TEXT, Startdate TEXT, Enddate TEXT, Type TEXT, Note TEXT)`);
  db.exec(`CREATE VIEW DailyAll AS ${tables.map(t => `SELECT * FROM ${t}`).join(' UNION ALL ')}`);
  const filename = path.join(root, 'routes/dailyLogs.js');
  const routeModule = new Module(filename, module);
  routeModule.filename = filename;
  routeModule.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = routeModule.require.bind(routeModule);
  routeModule.require = (request) => {
    if (request === '../database') return { db, dailyTables: tables, isValidDailyTable: t => tables.includes(t), logSystem() {} };
    if (request === '../services/dailyScanStorage') return { ensureDailyScanSectionDirectory() {} };
    return originalRequire(request);
  };
  routeModule._compile(fs.readFileSync(filename, 'utf8'), filename);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.access = { isAdmin: true }; next(); });
  app.use(routeModule.exports);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function add(day, status, inTime, outTime) {
    const response = await fetch(base + '/table/Daily1', { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ EmpID: '1', Name: 'Test employee', Department: 'البلاغات', Section: 'صباحاً',
        Today: `2026-11-${String(day).padStart(2, '0')}`, Period: 'نوبة صبح', Status: status, InTime: inTime, OutTime: outTime }) });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  try {
    for (let i = 1; i <= 5; i++) await add(i, 'أذن', '09:00', '16:00');
    let summary = await (await fetch(base + '/permission-summary?empId=1&today=2026-11-30')).json();
    assert.equal(summary.usedCount, 5);
    assert.equal(summary.usedMinutes, 300);
    assert.equal(summary.exceeded, true);
    const late = await add(6, 'حضور بعد غياب', '09:50', '16:00');
    const update = await fetch(base + '/table/Daily1/' + late.id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({InTime:'10:00'}) });
    assert.equal(update.status, 200, await update.clone().text());
    let alerts = await (await fetch(base + '/monthly-alerts?today=2026-11-30')).json();
    assert.equal(alerts[0].lateMinutes, 120);
    assert.equal(alerts[0].lateExceeded, true);
    assert.equal(alerts[0].permissionCount, 5);
    assert.equal(alerts[0].permissionMinutes, 300);
    const december = await (await fetch(base + '/monthly-alerts?today=2026-12-01')).json();
    assert.deepEqual(december, []);
    console.log('Live route: fifth permission, duration, late update, monthly warnings and month reset OK');

    const catalog = require(path.join(root, 'public/status-catalog'));
    for (const file of ['public/daily.html', 'mobile/daily.html']) {
      const html = fs.readFileSync(path.join(root, file), 'utf8');
      for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1], { filename:file });
      const helpers = html.slice(html.indexOf('    function getMonthlyUsage('), html.indexOf('    function createEmployeeName('));
      const context = vm.createContext({MainProjectStatusCatalog:catalog, normalizeText: s=>String(s||'').toLowerCase(),
        monthlyAlertMap: new Map([['emp:1', alerts[0]]]), formatPermissionDuration:n=>String(n)});
      vm.runInContext(helpers, context);
      assert.equal(vm.runInContext("hasMonthlyStatusExceeded({EmpID:1,Status:'أذن'})", context), true);
      assert.equal(vm.runInContext("hasMonthlyStatusExceeded({EmpID:1,Status:'حضور بعد غياب'})", context), true);
      assert.equal(vm.runInContext("hasMonthlyStatusExceeded({EmpID:1,Status:'حضور'})", context), false);
      assert.equal(vm.runInContext("getMonthlyAlerts({EmpID:1,Status:'حضور'}).length", context), 2);
      console.log(file + ': syntax, red badges and persistent warning OK');
    }
  } finally {
    await new Promise(resolve=>server.close(resolve));
    db.close();
  }
});
