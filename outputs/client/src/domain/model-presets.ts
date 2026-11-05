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
];

export const apiFormatOptions: { value: ApiFormat; label: string; help: string }[] = [
  { value: 'openai-chat', label: 'OpenAI 兼容 · Chat Completions', help: '适用于大多数中转站、DeepSeek，以及支持聊天接口的 GPT 模型。' },
  { value: 'openai-responses', label: 'OpenAI 原生 · Responses', help: '适用于 GPT 官方，以及明确支持 Responses 的中转站。' },
  { value: 'anthropic-messages', label: 'Claude 原生 · Messages', help: '适用于 Claude 官方，以及明确支持 Anthropic 格式的中转站。' },
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
