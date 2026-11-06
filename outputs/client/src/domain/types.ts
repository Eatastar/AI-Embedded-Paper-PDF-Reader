export type GenerationStatus = 'complete' | 'streaming' | 'error' | 'interrupted';
export type AnnotationStatus = 'draft' | 'generating' | 'answered' | 'error' | 'interrupted' | 'noted';

export interface InputMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface MessageVersion {
  id: string;
  content: string;
  status: GenerationStatus;
  createdAt: number;
  modelLabel?: string;
  error?: string;
  context?: InputMessage[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  versions: MessageVersion[];
  activeVersionId: string;
}

export interface Annotation {
  id: string;
  conversationId: string;
  messageId: string;
  versionId: string;
  quote: string;
  anchor: unknown;
  color: string;
  question: string;
  answer: string;
  mode?: 'ask' | 'note';
  note?: string;
  originalQuestion?: string;
  originalAnswer?: string;
  edited: boolean;
  status: AnnotationStatus;
  createdAt: number;
  updatedAt: number;
  context?: InputMessage[];
  error?: string;
  deletedAt?: number;
  reask?: AnnotationAttempt;
}

/** A pending replacement. The current successful exchange stays intact until commit. */
export interface AnnotationAttempt {
  question: string;
  answer: string;
  status: 'draft' | 'generating' | 'error' | 'interrupted';
  context?: InputMessage[];
  error?: string;
}

export interface DocumentPage {
  pageNumber: number;
  text: string;
  messageId: string;
  versionId: string;
}

export interface DocumentAttachment {
  id: string;
  name: string;
  kind: 'pdf' | 'text';
  mimeType: string;
  size: number;
  createdAt: number;
  pages: DocumentPage[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  annotations: Annotation[];
  documents?: DocumentAttachment[];
  deletedAt?: number;
}

export interface Workspace {
  schemaVersion: 1;
  conversations: Conversation[];
  activeConversationId: string;
}

export type ApiFormat = 'openai-chat' | 'openai-responses' | 'anthropic-messages';

export interface ModelProfile {
  id: string;
  name: string;
  apiFormat: ApiFormat;
  baseURL: string;
  model: string;
  systemPrompt: string;
  hasApiKey: boolean;
  keySaved: boolean;
}

export interface ProfileInput {
  id?: string;
  name: string;
  apiFormat: ApiFormat;
  baseURL: string;
  model: string;
  systemPrompt: string;
  apiKey?: string;
  clearApiKey?: boolean;
  activate?: boolean;
}

export interface ModelSettings {
  mode: 'demo' | 'api';
  baseURL: string;
  model: string;
  systemPrompt: string;
  hasApiKey: boolean;
  apiFormat: ApiFormat;
  profiles: ModelProfile[];
  activeProfileId: string | null;
  persistence: 'encrypted' | 'configuration' | 'session';
  storageWarning?: string;
}
