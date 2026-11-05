const { mkdirSync, appendFileSync, statSync, renameSync } = require('node:fs');
const { join } = require('node:path');

/** Receives only the server's whitelisted diagnostic records, never raw errors. */
function createRequestLog(profile) {
  const directory = join(profile, 'logs');
  const path = join(directory, 'requests.jsonl');
  const fields = ['time', 'requestId', 'kind', 'outcome', 'transport', 'apiFormat', 'host', 'model', 'httpStatus', 'code', 'elapsedMs', 'upstreamRequestId'];
  return {
    path,
    write(record) {
      const safe = Object.fromEntries(fields.filter(key => ['string', 'number'].includes(typeof record?.[key])).map(key => [key, record[key]]));
      try {
        mkdirSync(directory, { recursive: true });
        let size = 0;
        try { size = statSync(path).size; } catch { /* First write. */ }
        if (size > 1024 * 1024) {
          try { renameSync(path, join(directory, 'requests-previous.jsonl')); } catch { return; }
        }
        appendFileSync(path, JSON.stringify(safe) + '\n', { encoding: 'utf8', mode: 0o600 });
      } catch { /* Diagnostics must never break a model request. */ }
    },
  };
}

module.exports = { createRequestLog };
