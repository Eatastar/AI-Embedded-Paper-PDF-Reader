import type { FigureSelection, FigureStroke } from './figure';
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
  annotationReferences?: AnnotationReference[];
  textReference?: ChatTextReference;
}

/** An explicit selection copied into one chat question, without creating a note. */
export interface ChatTextReference {
  conversationId: string;
  messageId: string;
  versionId: string;
  label: string;
  text: string;
}

/** A user-selected copy of an annotation, attached to one chat question. */
export interface AnnotationReference {
  annotationId: string;
  label: string;
  quote: string;
  mode: 'ask' | 'note';
  question: string;
  answer: string;
  note?: string;
}

export interface Annotation {
  figure?: FigureSelection;
  modelLabel?: string;
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
  requestPreference?: string;
  documentContextMode?: 'auto' | 'full' | 'relevant';
  error?: string;
  deletedAt?: number;
  reask?: AnnotationAttempt;
}

/** A pending replacement. The current successful exchange stays intact until commit. */
export interface AnnotationAttempt {
  figureStrokes?: FigureStroke[];
  question: string;
  answer: string;
  status: 'draft' | 'generating' | 'error' | 'interrupted';
  context?: InputMessage[];
  requestPreference?: string;
  documentContextMode?: 'auto' | 'full' | 'relevant';
  error?: string;
}

export interface DocumentPage {
  /** Stable chapter metadata for reflowable books; PDF page records stay unchanged. */
  title?: string;
  pageNumber: number;
  text: string;
  messageId: string;
  versionId: string;
}

export interface DocumentAttachment {
  id: string;
  name: string;
  kind: DocumentKind;
  mimeType: string;
  size: number;
  createdAt: number;
  pages: DocumentPage[];
}

export type DocumentKind = 'pdf' | 'text' | 'epub' | 'mobi' | 'azw3';
export const isEbookKind = (kind: DocumentKind) => kind === 'epub' || kind === 'mobi' || kind === 'azw3';

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
  imageInput?: 'auto' | 'supported' | 'unsupported';
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
  imageInput?: 'auto' | 'supported' | 'unsupported';
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
  imageInput?: 'auto' | 'supported' | 'unsupported';
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
