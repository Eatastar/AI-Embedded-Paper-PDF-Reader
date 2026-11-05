const { mkdirSync, appendFileSync, statSync, renameSync } = require('node:fs');
const { join } = require('node:path');

function errorCode(error) {
  return typeof error?.code === 'string' && /^[A-Z0-9_-]{1,48}$/.test(error.code) ? error.code : 'STARTUP_FAILED';
}

function createStartupLog(profile) {
  const directory = join(profile, 'logs');
  const path = join(directory, 'startup.log');
  return {
    path,
    write(phase, details = {}) {
      // Only lifecycle codes and counters are accepted. Do not write request
      // content, headers, URLs, exception messages, or user/model configuration.
      const safe = {};
      for (const key of ['version', 'code', 'reason', 'processType']) {
        if (typeof details[key] === 'string' && /^[a-zA-Z0-9_. -]{1,80}$/.test(details[key])) safe[key] = details[key];
      }
      for (const key of ['pid', 'exitCode']) if (Number.isInteger(details[key])) safe[key] = details[key];
      try {
        mkdirSync(directory, { recursive: true });
        try { if (statSync(path).size > 256 * 1024) renameSync(path, join(directory, 'startup-previous.log')); } catch { /* A new log needs no rotation. */ }
        appendFileSync(path, JSON.stringify({ time: new Date().toISOString(), phase: String(phase).replace(/[^a-z0-9_-]/gi, '').slice(0, 64), ...safe }) + '\n');
      } catch { /* Logging must never prevent the application from starting. */ }
    },
  };
}

async function withStartupTimeout(promise, milliseconds = 20000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('Startup timed out'), { code: 'STARTUP_TIMEOUT' })), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

module.exports = { createStartupLog, errorCode, withStartupTimeout };
