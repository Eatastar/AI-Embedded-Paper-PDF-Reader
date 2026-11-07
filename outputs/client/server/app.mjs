import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { streamText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { createProfileManager, ProfileError } from './profiles.mjs';
import { discoverModels } from './model-discovery.mjs';
import { streamProtocolReply } from './protocols.mjs';
import { errorDetails, safeRequestRecord } from './diagnostics.mjs';
import { translationRequest, TranslationError } from './translation.mjs';
import { validateImageInput, friendlyImageError, ImageInputError } from './vision.mjs';

export { isLocalEndpoint } from './profiles.mjs';

const CHAT_BODY_LIMIT = 32 * 1024 * 1024;
const SETTINGS_BODY_LIMIT = 32 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readJson(req, limit) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new RequestError(415, '请求需要使用 JSON 格式。');
  if (Number(req.headers['content-length']) > limit) throw new RequestError(413, `请求过大。上限为 ${Math.round(limit / 1024)} KB；不会截断聊天记录。`);
  return new Promise((resolveBody, reject) => {
    let length = 0;
    let rejected = false;
    const chunks = [];
    req.on('data', chunk => {
      if (rejected) return;
      length += chunk.length;
      if (length > limit) {
        rejected = true;
        chunks.length = 0;
        reject(new RequestError(413, `请求过大。上限为 ${Math.round(limit / 1024)} KB；不会截断聊天记录。`));
      } else chunks.push(chunk);
    });
    req.once('end', () => {
      if (rejected) return;
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new RequestError(400, '请求中的 JSON 无法读取。')); }
    });
    req.once('error', () => reject(new RequestError(400, '请求读取失败，请重试。')));
  });
}

function validateChat(body) {
  if (!body || typeof body !== 'object' || !['main', 'annotation'].includes(body.kind)) throw new RequestError(400, '聊天请求类型不正确。');
  if (!Array.isArray(body.messages) || body.messages.length === 0) throw new RequestError(400, '请先输入问题。');
  if (body.messages.some(message => !message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim())) throw new RequestError(400, '聊天消息格式不正确，消息不能为空。');
  if (!body.messages.some(message => message.role === 'user')) throw new RequestError(400, '聊天请求缺少用户问题。');
  if (body.kind === 'annotation' && (typeof body.quote !== 'string' || !body.quote.trim())) throw new RequestError(400, '批注请求缺少选中的原文。');
  if (body.variant !== undefined && (!Number.isInteger(body.variant) || body.variant < 0)) throw new RequestError(400, '回答版本格式不正确。');
  if (body.profileId !== undefined && body.profileId !== null && typeof body.profileId !== 'string') throw new RequestError(400, '模型配置标识不正确。');
  if (body.image !== undefined) { if (body.kind !== 'annotation') throw new RequestError(400, '图片只随主动发起的图片批注发送。'); validateImageInput(body.image); }
  return body;
}

export function friendlyModelError(error, timedOut = false) {
  if (timedOut) return '请求等待超时，已停止。请稍后重试，或检查模型服务。';
  const { code } = errorDetails(error);
  if (['ERR_PROXY_CONNECTION_FAILED', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_NO_SUPPORTED_PROXIES'].includes(code)) return '无法连接系统代理。请确认代理软件已启动、系统代理已开启，且本机代理端口可用。';
  if (['ERR_PROXY_AUTH_REQUESTED', 'ERR_INVALID_AUTH_CREDENTIALS'].includes(code)) return '系统代理要求身份验证，请先在代理软件中完成验证后重试。';
  if (['UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT', 'ERR_CONNECTION_TIMED_OUT'].includes(code)) return '连接模型服务器超时。请检查代理软件是否运行、系统代理是否开启，以及所选代理线路能否访问模型服务。';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ERR_NAME_NOT_RESOLVED'].includes(code)) return '模型服务器域名解析失败。请检查网络、DNS 和代理设置。';
  if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_CERT_AUTHORITY_INVALID', 'ERR_CERT_DATE_INVALID', 'ERR_SSL_PROTOCOL_ERROR'].includes(code)) return '模型连接的证书或安全连接校验失败。请检查系统时间、系统证书及代理配置。';
  if (['ERR_CONNECTION_REFUSED', 'ECONNREFUSED'].includes(code)) return '网络连接被拒绝。请检查代理软件及端口，或确认本机模型服务已启动。';
  if (['ECONNRESET', 'UND_ERR_SOCKET', 'ERR_CONNECTION_RESET', 'ERR_INTERNET_DISCONNECTED', 'ERR_NETWORK_CHANGED'].includes(code)) return '模型连接已断开。请检查网络或代理线路，恢复后可以继续发送问题。';
  if (['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(code)) return '等待模型响应超时。请检查代理线路，或稍后重试。';
  if (code === 'insufficient_quota') return 'API 可用额度不足或已达到支出限额，请检查 API 账户计费与用量限制。';
  if (code === 'rate_limit_exceeded') return '模型服务请求过于频繁，请稍后重试，或降低请求频率。';
  if (code === 'unsupported_country_region_territory') return '当前请求所在地区不在服务支持范围内，请核对服务商的可用地区要求。';
  if (code === 'model_not_found') return '所选模型不存在，或当前 API 项目没有访问权限。请核对模型名称与项目权限。';
  if (code === 'invalid_api_key') return 'API 密钥验证失败，请检查这份连接的密钥是否有效。';
  if (code === 'organization_verification_required' || code === 'permission_denied') return '当前 API 项目或组织缺少所需权限，请核对模型访问权限和组织验证状态。';
  if (error?.code === 'output_limit') return '模型达到输出长度限制，回答尚未完成。可以重试原问题，或选择输出容量更大的模型。';
  if (error?.code === 'stream_incomplete' || error?.code === 'missing_stream') return '模型连接提前结束，回答尚未完成。请检查网络或接口格式后重试原问题。';
  if (error?.code === 'model_incomplete' || error?.code === 'empty_response') return '模型没有正常完成文字回答，请检查所选模型和接口格式后重试原问题。';
  const status = error?.statusCode ?? error?.cause?.statusCode;
  const text = String(error?.message || '') + ' ' + String(error?.responseBody || '');
  if (status === 413 || /context[_\s-]*(length|window)|maximum context|too many tokens|token limit|context_length_exceeded/i.test(text)) return '本次资料和对话超过模型容量。请切换按需引用、新建对话或选择容量更大的模型；本程序未自动截断主对话。';
  if (status === 401 || status === 403) return '模型服务拒绝了认证。请检查 API Key、接口权限和余额。';
  if (status === 429) return '模型服务暂时限制请求，或额度不足。请稍后重试并检查账户额度。';
  if (status === 404) return '未找到模型或 API 接口。请检查 API 地址是否包含 /v1，以及模型名称是否正确。';
  if (status >= 500) return '模型服务暂时不可用。请稍后重试。';
  if (error?.name === 'AbortError') return '回答已停止。';
  return '无法完成模型请求。请检查服务地址、模型名称、网络及 API Key。';
}

function demoAnswer(body) {
  const question = body.messages.findLast(message => message.role === 'user').content;
  if (body.kind === 'annotation') {
    let explanation;
    if (/测地线/.test(question.split('旁注问题：').at(-1))) explanation = '测地线可以理解为几何所决定的“自然路径”。例如，在地球表面从一处前往另一处，最短路线通常是大圆弧的一段，在平面地图上看起来可能是弯的。时空中的测地线是相应的四维概念：不受其他力推动的物体沿它自由运动。';
    else if (/曲率|弯曲|几何/.test(body.quote)) explanation = '可以把“时空曲率”理解为：物质和能量改变了周围时空的几何关系。自由运动的物体沿着这种几何中的自然路径前进，我们看到的效果就是引力。弹性薄膜上的小球只是帮助想象的比喻，真实时空有四个维度，也不需要外部重力把它压弯。';
    else if (/时间|钟|快慢/.test(body.quote)) explanation = '不同位置的钟不一定以相同速率走动。在其他条件相当时，引力较强处的钟相对于远处的钟走得更慢。这并不意味着当地的人觉得自己的动作变慢；差异需要把不同位置的钟放在一起比较，或交换信号后才能发现。';
    else if (/等效|自由落体/.test(body.quote)) explanation = '设想你在没有窗户的电梯里：当电梯自由下落时，你和身边的物体一起下落，会短暂感觉失重。等效原理把局部引力与加速运动联系起来；这个“局部”很重要，足够大的空间仍能通过潮汐效应区分两者。';
    else explanation = `这段文字需要放在主回答的语境里理解。你可以把概念拆成“它描述什么”和“能观察到什么现象”两步阅读，再回到原句检查它们的关系。当前为演示模式，尚未连接模型，不能针对任意原文生成真实解释。`;
    return `**本地演示批注**\n\n${explanation}\n\n*这是预置的交互示例。连接 API 后，只发送所属文档或原回答、选中原文和这条批注问题，不带主聊天及其他批注。*`;
  }
  if (/广义相对论|引力|时空/.test(question)) {
    if ((body.variant || 0) > 0) return '**本地演示 · 另一个讲法**\n\n广义相对论用时空几何描述引力：物质和能量改变时空，自由运动的物体沿弯曲时空中的自然路径前进。\n\n例如，地球绕太阳运行，可以理解为它沿太阳周围时空中的轨迹运动。这里的“弯曲”不是向某个看不见的外部空间弯过去，而是时空本身的距离、时间和路径关系发生变化。\n\n**时间也会受到引力影响**：在其他条件相当时，引力较强处的钟，相对于远处的钟走得更慢。\n\n这份新回答拥有独立版本。原回答的高亮和批注保留在原版本中，切回去便能看到。\n\n*此内容为预置演示，没有调用 AI API。选中一段文字，即可试用一次批注问答。*';
    return '**广义相对论，把引力看成时空的几何。**\n\n牛顿把引力描述为物体之间的吸引力。爱因斯坦给出了另一种理解：物质和能量使周围的时空弯曲，物体沿着弯曲时空中的自然路径运动，这就表现为我们熟悉的引力。\n\n### 1. 什么是时空曲率？\n\n时空由三个空间维度和一个时间维度构成。所谓“时空曲率”，描述的是距离、时间与运动路径之间的几何关系如何偏离平直时空。你可以用弹性薄膜辅助想象，但它只是比喻，真实时空并不是被外部力量压弯的薄膜。\n\n### 2. 为什么时间也会变化？\n\n在其他条件相当时，引力较强处的钟，相对于远处的钟走得更慢。这被称为引力时间膨胀。当地的人仍会觉得自己的钟正常走动；差异出现在不同位置的钟彼此比较时。\n\n### 3. 如何检验这个理论？\n\n广义相对论预言了光线经过大质量天体附近时会偏转，也能解释水星近日点的额外进动，以及引力波等现象。\n\n一个有用的起点是等效原理：在足够小的区域里，自由落体中的观察者可以暂时消除局部引力的影响。\n\n*本地演示内容，未调用 AI。试着选中“时空曲率”或“引力时间膨胀”，点击“批注提问”。*';
  }
  return `**本地演示回答**\n\n你提出了：“${question}”\n\n这个客户端已经具备主聊天、文字高亮、可重新提问的批注问答、回答版本切换与本地保存。当前显示的是预置内容，没有连接 AI，因此不会假装已经理解并回答任意问题。\n\n你可以先发送“什么是广义相对论”，体验完整的示例；也可以在右上角打开“模型设置”，填写兼容 OpenAI 的 API 地址、模型名称与密钥，切换到真实模型。\n\n选中回答中的一段文字后，批注只会关联到这个回答版本。关闭批注框后，高亮仍保留；再次点击高亮就能重新打开。`;
}

async function serveFile(req, res, pathname, distDir) {
  const root = resolve(distDir);
  let path;
  try { path = resolve(root, '.' + decodeURIComponent(pathname)); } catch { throw new RequestError(400, '页面路径不正确。'); }
  if (path !== root && !path.startsWith(root + sep)) throw new RequestError(403, '无法访问该路径。');
  let file = path;
  try { if (!(await stat(file)).isFile()) file = resolve(root, 'index.html'); }
  catch { file = resolve(root, 'index.html'); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { json(res, 404, { error: '客户端尚未构建。请先运行构建命令，或使用开发启动命令。' }); }
}

/** Keys are held by the private profile manager; public responses contain metadata only. */
export function createAppServer({ env = process.env, distDir = resolve('dist'), fetch: customFetch, demoDuration = 1000, timeoutMs = 120000, accessToken = '', allowDevOrigins = true, profileStore, transport = 'node', onRequestLog } = {}) {
  const expectedAccessToken = Buffer.from(accessToken);
  const profiles = createProfileManager({ store: profileStore, initialSettings: {
    mode: 'demo',
    apiFormat: 'openai-chat',
    baseURL: env.AI_BASE_URL || 'https://api.openai.com/v1',
    model: env.AI_MODEL || '',
    systemPrompt: env.AI_SYSTEM_PROMPT || '请清楚、准确地回答，支持使用 Markdown，解释概念时适当举例。',
    apiKey: env.AI_API_KEY || '',
  } });
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      if (expectedAccessToken.length) {
        const supplied = Buffer.from(typeof req.headers['x-margin-session'] === 'string' ? req.headers['x-margin-session'] : '');
        if (supplied.length !== expectedAccessToken.length || !timingSafeEqual(supplied, expectedAccessToken)) throw new RequestError(403, '请求来源不受信任，请从本机客户端打开。');
      }
      const port = server.address()?.port;
      const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, ...(allowDevOrigins ? ['127.0.0.1:4317', 'localhost:4317'] : [])]);
      if (!allowedHosts.has(req.headers.host)) throw new RequestError(403, '仅允许从本机客户端访问。');
      if (req.headers.origin && !new Set([...allowedHosts].map(host => `http://${host}`)).has(req.headers.origin)) throw new RequestError(403, '请求来源不受信任，请从本机客户端打开。');
      const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
      if (pathname === '/api/health' && req.method === 'GET') return json(res, 200, { app: 'margin-chat', version: '0.1.0', instanceId: env.MARGIN_CLIENT_INSTANCE_ID || null });
      if (pathname === '/api/shutdown' && req.method === 'POST') {
        const body = await readJson(req, 1024);
        const supplied = Buffer.from(typeof body?.token === 'string' ? body.token : '');
        const expected = Buffer.from(env.MARGIN_CLIENT_SHUTDOWN_TOKEN || '');
        if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new RequestError(403, '无法确认本次启动的身份，未停止服务。');
        json(res, 200, { stopped: true });
        setTimeout(() => server.emit('shutdownRequested'), 100);
        return;
      }
      if (pathname === '/api/settings' && req.method === 'GET') return json(res, 200, profiles.publicSettings());
      if (pathname === '/api/settings' && req.method === 'POST') {
        return json(res, 200, profiles.updateSettings(await readJson(req, SETTINGS_BODY_LIMIT)));
      }
      if (pathname === '/api/profiles' && req.method === 'POST') return json(res, 200, profiles.saveProfile(await readJson(req, SETTINGS_BODY_LIMIT)));
      if (pathname === '/api/models' && req.method === 'POST') {
        const config = profiles.forDiscovery(await readJson(req, SETTINGS_BODY_LIMIT));
        const controller = new AbortController();
        const disconnected = () => controller.abort();
        res.on('close', disconnected);
        try { return json(res, 200, await discoverModels(config, { fetch: customFetch || globalThis.fetch, signal: controller.signal })); }
        finally { res.off('close', disconnected); }
      }
      if (pathname === '/api/profiles/select' && req.method === 'POST') {
        const body = await readJson(req, SETTINGS_BODY_LIMIT);
        return json(res, 200, profiles.selectProfile(body?.profileId));
      }
      if (pathname === '/api/profiles/delete' && req.method === 'POST') {
        const body = await readJson(req, SETTINGS_BODY_LIMIT);
        return json(res, 200, profiles.deleteProfile(body?.profileId));
      }
      if ((pathname === '/api/chat' || pathname === '/api/translate') && req.method === 'POST') {
        const body = pathname === '/api/translate' ? translationRequest(await readJson(req, 192 * 1024)) : validateChat(await readJson(req, CHAT_BODY_LIMIT));
        const activeSettings = profiles.forRequest(body.profileId);
        const requestId = randomUUID();
        const startedAt = Date.now();
        let observedStatus;
        let upstreamRequestId;
        let outcome = 'aborted';
        let failureCode = 'ABORTED';
        const requestFetch = async (url, options) => {
          const response = await (customFetch || globalThis.fetch)(url, options);
          observedStatus = response.status;
          upstreamRequestId = response.headers.get('x-request-id');
          return response;
        };
        const controller = new AbortController();
        let timedOut = false;
        const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
        const disconnected = () => controller.abort();
        res.once('close', disconnected);
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.flushHeaders();
        const send = data => {
          if (data.type === 'done') { outcome = 'complete'; failureCode = 'COMPLETE'; }
          if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
        };
        const fail = error => {
          const details = errorDetails(error, timedOut);
          outcome = controller.signal.aborted && !timedOut ? 'aborted' : 'error';
          failureCode = details.code;
          if (observedStatus === undefined) observedStatus = details.httpStatus;
          const friendly = body.image && error instanceof RequestError ? error.message : friendlyModelError(error, timedOut);
          send({ type: 'error', message: `${body.image && !timedOut && !(error instanceof RequestError) ? friendlyImageError(error, friendly) : friendly}\n诊断编号：${requestId}`, requestId });
        };
        try {
          if (body.image && activeSettings.mode === 'demo') throw new RequestError(400, '图片问答需要连接支持图片理解的模型，当前为本地演示。');
          if (body.image && activeSettings.imageInput === 'unsupported') throw new RequestError(400, '此连接已设置为不支持图片。请切换支持图片理解的模型后重试，图片、圈画和问题已保留。');
          if (activeSettings.mode === 'demo') {
            const answer = demoAnswer(body);
            const chunkSize = Math.max(8, Math.ceil(answer.length / 26));
            for (let index = 0; index < answer.length; index += chunkSize) {
              await sleep(demoDuration / Math.ceil(answer.length / chunkSize), undefined, { signal: controller.signal });
              send({ type: 'delta', text: answer.slice(index, index + chunkSize) });
            }
            send({ type: 'done', modelLabel: '本地演示 · 未调用 AI' });
          } else {
            const annotationInstruction = body.kind === 'annotation' ? `你在解释一条独立批注。只根据本次提供的原文资料、选中原文和批注问题回答；不引用主聊天或其他批注问答，资料不足时明确说明。选中原文：\n${body.quote}` : '';
            if (activeSettings.apiFormat !== 'openai-chat' || body.image) {
              const result = await streamProtocolReply({ ...activeSettings, messages: body.messages, image: body.image, annotationInstruction, signal: controller.signal, fetch: requestFetch, onText: text => send({ type: 'delta', text }) });
              if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
              send({ type: 'done', modelLabel: activeSettings.model, ...(result.usage ? { usage: result.usage } : {}) });
              return;
            }
            const provider = createOpenAICompatible({ name: 'custom', baseURL: activeSettings.baseURL, ...(activeSettings.apiKey ? { apiKey: activeSettings.apiKey } : {}), fetch: requestFetch });
            // The client includes its preference in the message snapshot. Reapplying
            // current settings here would duplicate it and change failed-note retries.
            const result = streamText({ model: provider.chatModel(activeSettings.model), messages: body.messages, system: annotationInstruction || undefined, allowSystemInMessages: true, maxRetries: 0, streamRetries: 0, abortSignal: controller.signal, onError: () => {} });
            let streamError;
            for await (const part of result.fullStream) {
              if (part.type === 'text-delta') send({ type: 'delta', text: part.text });
              else if (part.type === 'error') streamError = part.error;
              else if (part.type === 'abort') throw new DOMException('Aborted', 'AbortError');
            }
            if (streamError) throw streamError;
            if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            const finishReason = await result.finishReason;
            if (finishReason !== 'stop') {
              const message = finishReason === 'length'
                ? '模型达到输出长度限制，回答尚未完成。可以重试原问题，或选择输出容量更大的模型。'
                : finishReason === 'content-filter'
                  ? '模型服务中断了这次回答，尚未完成。可以检查服务设置后重试原问题。'
                  : '模型没有正常完成回答，请检查所选模型是否支持文字聊天后重试原问题。';
              outcome = 'error';
              failureCode = finishReason === 'length' ? 'output_limit' : finishReason === 'content-filter' ? 'content_filtered' : 'model_incomplete';
              send({ type: 'error', message: `${message}\n诊断编号：${requestId}`, requestId });
              return;
            }
            const usage = await result.totalUsage;
            send({ type: 'done', modelLabel: activeSettings.model, usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens } });
          }
        } catch (error) {
          fail(error);
        } finally {
          clearTimeout(timeout);
          res.off('close', disconnected);
          if (!res.writableEnded) res.end();
          if (activeSettings.mode !== 'demo' && typeof onRequestLog === 'function') {
            const record = safeRequestRecord({ time: new Date(startedAt).toISOString(), requestId, kind: body.kind, outcome, transport, apiFormat: activeSettings.apiFormat, host: new URL(activeSettings.baseURL).host, model: activeSettings.model, httpStatus: observedStatus, code: failureCode, elapsedMs: Date.now() - startedAt, upstreamRequestId });
            try { onRequestLog(record); } catch { /* Diagnostics must not affect the response. */ }
          }
        }
        return;
      }
      if (pathname.startsWith('/api/')) return json(res, 404, { error: '未找到该接口。' });
      if (!['GET', 'HEAD'].includes(req.method || '')) throw new RequestError(405, '不支持该操作。');
      await serveFile(req, res, pathname, distDir);
    } catch (error) {
      if (!res.headersSent) json(res, error instanceof RequestError || error instanceof ProfileError || error instanceof TranslationError || error instanceof ImageInputError ? error.status : 500, { error: error instanceof RequestError || error instanceof ProfileError || error instanceof TranslationError || error instanceof ImageInputError ? error.message : '本地服务遇到问题，请重试。' });
      else if (!res.writableEnded) res.end();
    }
  });
  server.requestTimeout = timeoutMs + 30000;
  server.headersTimeout = 15000;
  return server;
}
