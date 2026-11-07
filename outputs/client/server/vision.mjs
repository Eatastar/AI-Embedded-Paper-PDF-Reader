export class ImageInputError extends Error { constructor(message) { super(message); this.status = 400; this.code = 'invalid_image_input'; } }
const fail = () => { throw new ImageInputError('图片格式或尺寸无效，请重新框选。'); };
function dimensions(bytes, mime) {
  if (mime === 'image/png') {
    if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(8) !== 13) return fail();
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  if (mime === 'image/webp') {
    if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length) return fail();
    const type = bytes.toString('ascii', 12, 16);
    if (type === 'VP8X') return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
    if (type === 'VP8 ' && bytes.subarray(23, 26).equals(Buffer.from([157, 1, 42]))) return [bytes.readUInt16LE(26) & 16383, bytes.readUInt16LE(28) & 16383];
    if (type === 'VP8L' && bytes[20] === 47) { const bits = bytes.readUInt32LE(21); return [(bits & 16383) + 1, ((bits >>> 14) & 16383) + 1]; }
    return fail();
  }
  if (bytes.length < 10 || bytes[0] !== 255 || bytes[1] !== 216) return fail();
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset++] !== 255) return fail();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217 || marker === 218) break;
    if (marker === 216 || (marker >= 208 && marker <= 215)) continue;
    if (offset + 2 > bytes.length) return fail();
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return fail();
    if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) { if (length < 7) return fail(); return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)]; }
    offset += length;
  }
  return fail();
}
/** Only an explicit, bounded inline crop is accepted. No remote image URLs. */
export function validateImageInput(image) {
  if (!image || typeof image !== 'object' || Array.isArray(image) || Object.keys(image).some(key => !['dataURL', 'width', 'height'].includes(key)) || typeof image.dataURL !== 'string' || image.dataURL.length > 1_398_150) return fail();
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image.dataURL);
  if (!match || match[2].length % 4) return fail();
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 1024 * 1024 || bytes.toString('base64') !== match[2]) return fail();
  const [width, height] = dimensions(bytes, match[1]);
  if (!width || !height || width > 1800 || height > 1800 || width * height > 2_000_000 || image.width !== width || image.height !== height) return fail();
  return { dataURL: image.dataURL, width, height };
}
export function imageMessages(messages, image, format) {
  if (!image) return messages;
  const checked = validateImageInput(image), index = messages.findLastIndex(message => message.role === 'user');
  if (index < 0) return fail();
  const match = /^data:([^;]+);base64,(.+)$/.exec(checked.dataURL);
  return messages.map((message, i) => i !== index ? message : { role: message.role, content: format === 'anthropic-messages'
    ? [{ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } }, { type: 'text', text: message.content }]
    : format === 'openai-responses' ? [{ type: 'input_text', text: message.content }, { type: 'input_image', image_url: checked.dataURL }]
      : [{ type: 'text', text: message.content }, { type: 'image_url', image_url: { url: checked.dataURL } }] });
}
export function friendlyImageError(error, fallback) {
  const status = error?.statusCode ?? error?.cause?.statusCode;
  const provider = error?.upstreamError?.error || error?.upstreamError || {};
  const code = String(provider.code || provider.type || error?.code || '').toLowerCase();
  const message = String(provider.message || error?.responseBody || error?.message || '').slice(0, 16000).toLowerCase();
  if (status === 401 || status === 403 || status === 404 || status === 429 || status >= 500 || /auth|api_key|permission|quota|credit_balance|spend_limit|rate_limit|econn|timeout|enotfound|network|proxy/i.test(code)) return fallback;
  if (status === 413) return '接口认为本次图片或资料过大，请缩小框选区域或切换按需引用。图片、圈画和问题已保留。';
  if (status === 415 || /invalid_image|unsupported_image_format/.test(code)) return '接口未接受这次图片的格式或数据，请重新框选或检查接口格式。图片、圈画和问题已保留。';
  if (/^(image_input_not_supported|image_model_not_supported|vision_not_supported|unsupported_modality)$/.test(code) || /(?:model|endpoint).{0,80}(?:does not|doesn't|cannot|can't) support (?:image|vision)|image inputs? (?:is|are) not supported|不支持(?:图片|图像|视觉)(?:输入)?/.test(message)) return '当前模型或接口明确拒绝了图片输入，请切换支持图片理解的连接后重试。图片、圈画和问题已保留。';
  if (status === 400) return '接口未接受这次图片请求，暂时无法确认是否支持图片。请检查接口格式或切换连接后重试；图片、圈画和问题已保留。';
  return fallback;
}
