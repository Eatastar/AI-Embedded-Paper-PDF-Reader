import type { ApiFormat, ProfileInput } from './types';

export interface ConnectionPreset {
  id: string;
  name: string;
  description: string;
  apiFormat: ApiFormat;
  baseURL: string;
  model: string;
  addressPlaceholder: string;
  modelPlaceholder: string;
}

export const connectionPresets: ConnectionPreset[] = [
  {
    id: 'relay', name: '中转站', description: '使用服务商提供的地址、格式和模型名',
    apiFormat: 'openai-chat', baseURL: '', model: '',
    addressPlaceholder: 'https://你的中转地址/v1', modelPlaceholder: '填写中转站提供的完整模型名称',
  },
  {
    id: 'openai', name: 'GPT 官方', description: 'OpenAI 官方接口',
    apiFormat: 'openai-responses', baseURL: 'https://api.openai.com/v1', model: '',
    addressPlaceholder: 'https://api.openai.com/v1', modelPlaceholder: '填写你的账户可用的 GPT 模型名称',
  },
  {
    id: 'anthropic', name: 'Claude 官方', description: 'Anthropic 官方接口',
    apiFormat: 'anthropic-messages', baseURL: 'https://api.anthropic.com/v1', model: '',
    addressPlaceholder: 'https://api.anthropic.com/v1', modelPlaceholder: '填写你的账户可用的 Claude 模型名称',
  },
  {
    id: 'deepseek', name: 'DeepSeek', description: 'DeepSeek 官方接口',
    apiFormat: 'openai-chat', baseURL: 'https://api.deepseek.com', model: 'deepseek-flash',
    addressPlaceholder: 'https://api.deepseek.com', modelPlaceholder: '例如 deepseek-flash',
  },
  {
    id: 'other', name: '其他', description: '本地部署、Kimi、千问、Gemini、Grok 或自定义 API',
    apiFormat: 'openai-chat', baseURL: '', model: '',
    addressPlaceholder: '填写服务地址，例如 http://localhost:11434/v1', modelPlaceholder: '填写服务中可用的完整模型名称',
  },
];

// Base URLs identify the API service, never a fixed model or an account credential.
// Regional services remain editable because keys and endpoints must match.
export const otherConnectionPresets: ConnectionPreset[] = [
  {
    id: 'custom', name: '自定义 API', description: '按服务提供的信息填写地址、接口格式和模型名称。',
    apiFormat: 'openai-chat', baseURL: '', model: '',
    addressPlaceholder: '填写服务地址，例如 http://localhost:11434/v1', modelPlaceholder: '填写服务中可用的完整模型名称',
  },
  {
    id: 'ollama', name: '本地 · Ollama', description: '先启动 Ollama，填写本机已安装的模型名；未启用鉴权时密钥可留空。',
    apiFormat: 'openai-chat', baseURL: 'http://localhost:11434/v1', model: '',
    addressPlaceholder: 'http://localhost:11434/v1', modelPlaceholder: '填写 Ollama 中已安装的模型名（含标签）',
  },
  {
    id: 'lmstudio', name: '本地 · LM Studio', description: '先开启 LM Studio 的本地服务，填写已加载模型的标识；地址和端口可以修改。',
    apiFormat: 'openai-chat', baseURL: 'http://localhost:1234/v1', model: '',
    addressPlaceholder: 'http://localhost:1234/v1', modelPlaceholder: '填写 LM Studio 中已加载模型的标识',
  },
  {
    id: 'kimi', name: 'Kimi · Moonshot', description: '默认填写中国内地站地址；国际站请改为 https://api.moonshot.ai/v1，并使用对应站点的密钥。',
    apiFormat: 'openai-chat', baseURL: 'https://api.moonshot.cn/v1', model: '',
    addressPlaceholder: 'https://api.moonshot.cn/v1', modelPlaceholder: '填写 Kimi 开放平台提供的模型名称',
  },
  {
    id: 'qwen', name: '千问 · 阿里云百炼', description: '默认北京地域兼容地址；其他地域或工作空间请换成对应 API 地址，并使用同地域密钥。',
    apiFormat: 'openai-chat', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '',
    addressPlaceholder: 'https://dashscope.aliyuncs.com/compatible-mode/v1', modelPlaceholder: '填写百炼控制台提供的模型名称',
  },
  {
    id: 'gemini', name: 'Gemini · Google AI Studio', description: '使用 Gemini 的兼容接口，填写 Google AI Studio 的 API 密钥和可用模型名。',
    apiFormat: 'openai-chat', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', model: '',
    addressPlaceholder: 'https://generativelanguage.googleapis.com/v1beta/openai', modelPlaceholder: '填写 Google AI Studio 提供的模型名称',
  },
  {
    id: 'grok', name: 'Grok · xAI', description: '使用 xAI 的聊天兼容接口，填写 xAI API 密钥和账户可用的模型名称。',
    apiFormat: 'openai-chat', baseURL: 'https://api.x.ai/v1', model: '',
    addressPlaceholder: 'https://api.x.ai/v1', modelPlaceholder: '填写 xAI 控制台提供的 Grok 模型名称',
  },
];

export const apiFormatOptions: { value: ApiFormat; label: string; help: string }[] = [
  { value: 'openai-chat', label: '通用兼容格式（Chat Completions）', help: '适用于支持 OpenAI 兼容接口的 Kimi、千问、DeepSeek、Grok、Ollama、LM Studio 等服务；Gemini 使用其官方兼容入口。' },
  { value: 'openai-responses', label: 'Responses 格式', help: '适用于明确支持 Responses 的服务。选择 GPT 官方模板时会自动填写此格式。' },
  { value: 'anthropic-messages', label: 'Messages 格式（Claude / Anthropic）', help: '适用于 Claude 官方，以及明确支持 Anthropic Messages 的服务。' },
];

export function profileFromPreset(preset: ConnectionPreset, systemPrompt: string): ProfileInput {
  return {
    name: preset.name,
    apiFormat: preset.apiFormat,
    baseURL: preset.baseURL,
    model: preset.model,
    systemPrompt,
  };
}
