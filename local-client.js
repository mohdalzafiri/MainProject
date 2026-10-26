const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
require('dotenv').config();

const DEFAULT_CENTRAL_SERVER_URL = 'http://PC-SERVER:5000';

function parseCentralServerUrl(value) {
  const target = new URL(String(value || DEFAULT_CENTRAL_SERVER_URL).trim());
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('CENTRAL_SERVER_URL must use http or https.');
  }
  return target;
}

function createProxyHandler(centralServerUrl) {
  const target = parseCentralServerUrl(centralServerUrl);
  const transport = target.protocol === 'https:' ? https : http;
  const targetBasePath = target.pathname.replace(/\/$/, '');

  return (req, res) => {
    const headers = {
      ...req.headers,
      host: target.host,
      origin: target.origin,
      'x-forwarded-host': req.headers.host || '',
      'x-forwarded-proto': req.protocol
    };

    const proxyRequest = transport.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      method: req.method,
      path: `${targetBasePath}${req.originalUrl}`,
      headers
    }, (proxyResponse) => {
      res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
      proxyResponse.pipe(res);
    });

    proxyRequest.on('error', (error) => {
      if (res.headersSent) {
        res.destroy(error);
        return;
      }

      res.status(502).json({
        status: 'unavailable',
        message: 'تعذر الاتصال بالخادم المركزي PC-SERVER'
      });
    });

    req.on('aborted', () => proxyRequest.destroy());
    req.pipe(proxyRequest);
  };
}

function createLocalClientApp({
  centralServerUrl = process.env.CENTRAL_SERVER_URL || DEFAULT_CENTRAL_SERVER_URL,
  rootDirectory = __dirname
} = {}) {
  const app = express();
  const publicDirectory = path.join(rootDirectory, 'public');
  const mobileDirectory = path.join(rootDirectory, 'mobile');
  const proxyToCentralServer = createProxyHandler(centralServerUrl);

  app.use((req, res, next) => {
    if (req.method === 'GET' && req.path.toLowerCase().endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  app.get('/local-health', (req, res) => {
    res.json({ status: 'ok', mode: 'local-client' });
  });

  app.use('/api', proxyToCentralServer);
  app.use('/archive-files', proxyToCentralServer);

  app.get('/mobile', (req, res) => {
    res.redirect(302, '/mobile-dashboard.html');
  });

  app.get('/mobile/dashboard.html', (req, res) => {
    res.redirect(302, '/mobile-dashboard.html');
  });

  app.use(express.static(publicDirectory));

  app.get('/force-list.html', (req, res) => {
    res.sendFile(path.join(publicDirectory, 'archive-folder.html'));
  });

  app.get(/^\/mobile\/(.+)$/, (req, res, next) => {
    const requested = req.params[0];
    const mobileFile = path.join(mobileDirectory, requested);
    const publicFile = path.join(publicDirectory, requested);

    if (fs.existsSync(mobileFile)) {
      return res.sendFile(mobileFile);
    }

    if (fs.existsSync(publicFile)) {
      return res.sendFile(publicFile);
    }

    next();
  });

  app.use('/mobile', express.static(mobileDirectory));

  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDirectory, 'login.html'));
  });

  return app;
}

async function verifyCentralServer(centralServerUrl) {
  const target = parseCentralServerUrl(centralServerUrl);
  const healthUrl = new URL('/api/health', target);
  const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`Central server health check failed with HTTP ${response.status}.`);
  }

  const health = await response.json();
  if (health.status !== 'ok') {
    throw new Error('Central server reported an unhealthy status.');
  }
}

async function startLocalClient() {
  const centralServerUrl = process.env.CENTRAL_SERVER_URL || DEFAULT_CENTRAL_SERVER_URL;
  const host = process.env.LOCAL_HOST || '127.0.0.1';
  const port = Number(process.env.LOCAL_PORT || 5000);

  await verifyCentralServer(centralServerUrl);

  const app = createLocalClientApp({ centralServerUrl });
  const server = app.listen(port, host, () => {
    console.log(`Local client URL: http://${host}:${port}`);
    console.log(`Central API: ${centralServerUrl}`);
  });

  return server;
}

if (require.main === module) {
  startLocalClient().catch((error) => {
    console.error('Unable to start local client:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  createLocalClientApp,
  parseCentralServerUrl,
  startLocalClient,
  verifyCentralServer
};
