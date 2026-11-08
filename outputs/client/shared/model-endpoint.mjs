/** Shared pure URL helper; contains no server or desktop dependencies. */
export function modelListEndpoint(baseURL) {
  const url = new URL(baseURL);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid model endpoint');
  const path = url.pathname.replace(/\/+$/, '');
  const resource = /\/(?:chat\/completions|responses|messages|models)$/.test(path);
  const prefix = resource ? path.replace(/\/(?:chat\/completions|responses|messages|models)$/, '') : path || '/v1';
  url.pathname = `${prefix}/models`;
  return url;
}
