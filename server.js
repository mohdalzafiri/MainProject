const express = require('express');
require('express-async-errors');
const cors = require('cors');
const bodyParser = require('body-parser');
const os = require('os');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const archiveRoutes = require('./routes/archive');
const app = express();

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

app.use(express.static(path.join(__dirname, 'public')));
app.use('/archive-files', express.static(archiveRoutes.archiveRoot || path.join(__dirname, 'Archive')));

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

app.use('/mobile', express.static(path.join(__dirname, 'mobile')));

// Routes
const apiRoutes = require('./routes');
const { db, dbClient, closeDatabase, initializeDatabase } = require('./database');
const { startDatabaseMaintenance, stopDatabaseMaintenance } = require('./services/databaseMaintenanceService');

app.get('/api/health', async (req, res) => {
  try {
    await db.prepare('SELECT 1').get();
    return res.json({ status: 'ok', databaseProvider: dbClient, uptimeSeconds: Math.floor(process.uptime()) });
  } catch (error) {
    return res.status(503).json({ status: 'unavailable', message: 'قاعدة البيانات غير جاهزة' });
  }
});

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/mobile', (req, res) => {
  res.redirect(302, '/mobile/dashboard.html');
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(error);
  return res.status(500).json({ message: 'تعذر تنفيذ الطلب بسبب خطأ داخلي في الخادم.' });
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

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received; closing server and database.`);

  const finishShutdown = async () => {
    await stopDatabaseMaintenance();
    await closeDatabase();
    process.exit(0);
  };

  if (server) server.close(finishShutdown);
  else await finishShutdown();

  setTimeout(async () => {
    await closeDatabase();
    process.exit(1);
  }, 10000).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

startServer().catch(async (error) => {
  console.error(`Server startup failed: ${error.message}`);
  await closeDatabase().catch(() => {});
  process.exitCode = 1;
});
