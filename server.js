const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const os = require('os');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { performance } = require('perf_hooks');
const {
  flushOperationMetrics,
  getThreshold,
  logSlowOperation,
  recordOperation
} = require('./utils/performanceMetrics');

const archiveRoutes = require('./routes/archive');
const app = express();
const slowRequestThresholdMs = getThreshold(process.env.SLOW_REQUEST_MS, 1000);
const performanceSummaryTimer = setInterval(flushOperationMetrics, 5 * 60 * 1000);
performanceSummaryTimer.unref();
const staticAssetOptions = {
  setHeaders(res, filePath) {
    if (/\.(?:css|js|mjs|svg|woff2?|ttf|otf|png|jpe?g|webp|gif|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    }
  }
};

function getLanIps() {
  const nets = os.networkInterfaces();
  const ips = [];

  Object.values(nets).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (entry.family === 'IPv4' && !entry.internal) {
        ips.push(entry.address);
      }
    });
  });

  return ips;
}

function buildCorsOptions() {
  const rawOrigins = process.env.CORS_ORIGIN;
  if (!rawOrigins) {
    return {};
  }

  const allowedOrigins = rawOrigins
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    }
  };
}

// Middleware
app.use(cors(buildCorsOptions()));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.toLowerCase().endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use('/api', (req, res, next) => {
  const startedAt = performance.now();
  res.once('finish', () => {
    const route = req.route && req.route.path;
    const rootPath = String(req.path || '').split('/').filter(Boolean)[0] || 'root';
    const routePath = route && route !== '/' ? route : '';
    const label = `${req.method} /api/${rootPath}${routePath}`;
    const durationMs = performance.now() - startedAt;
    recordOperation('http', label, durationMs);
    logSlowOperation('http', durationMs, slowRequestThresholdMs, {
      method: req.method,
      route: label,
      status: res.statusCode
    });
  });
  next();
});

app.get('/mobile', (req, res) => {
  res.redirect(302, '/mobile-dashboard.html');
});

app.get('/mobile/dashboard.html', (req, res) => {
  res.redirect(302, '/mobile-dashboard.html');
});

app.use(express.static(path.join(__dirname, 'public'), staticAssetOptions));
app.use('/archive-files', express.static(archiveRoutes.archiveRoot || path.join(__dirname, 'Archive')));

app.get('/force-list.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'archive-folder.html'));
});

app.get(/^\/mobile\/(.+)$/, (req, res, next) => {
  const requested = req.params[0];
  const mobileFile = path.join(__dirname, 'mobile', requested);
  const publicFile = path.join(__dirname, 'public', requested);

  if (fs.existsSync(mobileFile)) {
    return res.sendFile(mobileFile);
  }

  if (fs.existsSync(publicFile)) {
    return res.sendFile(publicFile);
  }

  next();
});

app.use('/mobile', express.static(path.join(__dirname, 'mobile'), staticAssetOptions));

// Routes
const apiRoutes = require('./routes');
const { db, closeDatabase, initializeDatabase } = require('./database');
const { startDatabaseMaintenance, stopDatabaseMaintenance } = require('./services/databaseMaintenanceService');

app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    return res.json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
  } catch (error) {
    return res.status(503).json({ status: 'unavailable', message: 'قاعدة البيانات غير جاهزة' });
  }
});

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Start server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

let server;

async function startServer() {
  await initializeDatabase();
  server = app.listen(PORT, HOST, () => {
    console.log(`Server is running on ${HOST}:${PORT}`);
    console.log(`Local URL: http://localhost:${PORT}`);
    getLanIps().forEach((ip) => {
      console.log(`LAN URL: http://${ip}:${PORT}`);
    });
    startDatabaseMaintenance();
  });
}

startServer().catch(async (error) => {
  console.error('Database initialization failed:', error);
  try {
    await closeDatabase();
  } catch (closeError) {
    console.error('Database close failed after initialization error:', closeError);
  }
  process.exitCode = 1;
});

let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received; closing server and database.`);

  if (!server) {
    closeDatabase();
    return;
  }

  server.close(async () => {
    await stopDatabaseMaintenance();
    closeDatabase();
    process.exit(0);
  });

  setTimeout(() => {
    closeDatabase();
    process.exit(1);
  }, 10000).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
