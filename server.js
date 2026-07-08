const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const os = require('os');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

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

function injectActivityTracker(htmlText) {
  const scriptTag = '<script src="/activity-tracker.js"></script>';
  if (String(htmlText || '').includes(scriptTag)) {
    return htmlText;
  }

  if (String(htmlText || '').includes('</body>')) {
    return htmlText.replace('</body>', `  ${scriptTag}\n</body>`);
  }

  return `${htmlText}\n${scriptTag}`;
}

// Middleware
app.use(cors(buildCorsOptions()));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if (req.method !== 'GET') {
    return next();
  }

  const rawPath = req.path === '/' ? '/login.html' : req.path;
  if (!String(rawPath).toLowerCase().endsWith('.html')) {
    return next();
  }

  const publicRoot = path.join(__dirname, 'public');
  const relativePath = String(rawPath).replace(/^\/+/, '');
  const absolutePath = path.join(publicRoot, relativePath);

  if (!absolutePath.startsWith(publicRoot)) {
    return next();
  }

  fs.readFile(absolutePath, 'utf8', (error, html) => {
    if (error) {
      return next();
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(injectActivityTracker(html));
  });
});

app.use(express.static(path.join(__dirname, 'public')));

// Routes
const apiRoutes = require('./routes');

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Start server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server is running on ${HOST}:${PORT}`);
  console.log(`Local URL: http://localhost:${PORT}`);
  getLanIps().forEach((ip) => {
    console.log(`LAN URL: http://${ip}:${PORT}`);
  });
});
