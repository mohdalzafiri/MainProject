'use strict';

const { performance } = require('perf_hooks');
const MAX_SAMPLES_PER_LABEL = 500;
const operationMetrics = new Map();

function getThreshold(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function logSlowOperation(kind, durationMs, thresholdMs, details = {}) {
  if (!Number.isFinite(durationMs) || durationMs < thresholdMs) return false;

  console.warn(
    '[performance] slow operation',
    JSON.stringify({
      kind,
      durationMs: Math.round(durationMs * 100) / 100,
      ...details,
    })
  );
  return true;
}

function getQueryLabel(sql) {
  const text = String(sql || '').replace(/--[^\r\n]*/g, ' ');
  const operationMatch = text.match(
    /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|PRAGMA)\b/i
  );
  const operation = operationMatch ? operationMatch[1].toUpperCase() : 'OTHER';
  const tableMatch = text.match(
    /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+["`]?([A-Za-z_][A-Za-z0-9_]*)/i
  );
  const table = tableMatch ? tableMatch[1] : '';
  return table ? `${operation} ${table}` : operation;
}

function recordOperation(kind, label, durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;

  const key = `${kind}:${label}`;
  let metric = operationMetrics.get(key);
  if (!metric) {
    metric = { kind, label, count: 0, totalMs: 0, samples: [] };
    operationMetrics.set(key, metric);
  }
  metric.count += 1;
  metric.totalMs += durationMs;
  if (metric.samples.length === MAX_SAMPLES_PER_LABEL) metric.samples.shift();
  metric.samples.push(durationMs);
}

function flushOperationMetrics() {
  for (const metric of operationMetrics.values()) {
    const sortedSamples = [...metric.samples].sort((left, right) => left - right);
    const p95Index = Math.max(0, Math.ceil(sortedSamples.length * 0.95) - 1);
    console.info(
      '[performance] summary',
      JSON.stringify({
        kind: metric.kind,
        label: metric.label,
        count: metric.count,
        averageMs: Math.round((metric.totalMs / metric.count) * 100) / 100,
        p95Ms: Math.round(sortedSamples[p95Index] * 100) / 100,
      })
    );
  }
  operationMetrics.clear();
}

async function measureOperation(kind, thresholdMs, details, operation) {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    const durationMs = performance.now() - startedAt;
    recordOperation(kind, details.label || details.operation || 'unlabeled', durationMs);
    logSlowOperation(kind, durationMs, thresholdMs, details);
  }
}

module.exports = {
  flushOperationMetrics,
  getThreshold,
  getQueryLabel,
  logSlowOperation,
  measureOperation,
  recordOperation,
};
