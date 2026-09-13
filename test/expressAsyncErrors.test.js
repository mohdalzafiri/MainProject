const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
require('express-async-errors');

test('forwards rejected async route handlers to Express error middleware', async () => {
  const app = express();
  app.get('/failure', async () => {
    throw new Error('database unavailable');
  });
  app.use((error, req, res, next) => {
    res.status(503).json({ message: error.message });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/failure`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { message: 'database unavailable' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});