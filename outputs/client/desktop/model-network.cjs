/** Model traffic uses Chromium's system-proxy support, including Windows PAC. */
function createModelFetch(modelSession) {
  if (typeof modelSession?.fetch !== 'function') throw new Error('Desktop network session is unavailable');
  return async function modelFetch(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid model endpoint');
    // Refresh this session's proxy configuration before a new request. Never retry
    // a model POST automatically, and never fall back to Node's direct fetch.
    const signal = init.signal || (typeof input === 'object' ? input.signal : undefined);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    let abort;
    try {
      await Promise.race([
        modelSession.forceReloadProxyConfig(),
        new Promise((_, reject) => {
          abort = () => reject(new DOMException('Aborted', 'AbortError'));
          signal?.addEventListener('abort', abort, { once: true });
          if (signal?.aborted) abort();
        }),
      ]);
    } finally { if (abort) signal?.removeEventListener('abort', abort); }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return modelSession.fetch(input instanceof URL ? url.href : input, {
      ...init, credentials: 'omit', cache: 'no-store', redirect: 'error',
      bypassCustomProtocolHandlers: true,
    });
  };
}

module.exports = { createModelFetch };
