import type { Annotation } from './types';
export const isAnnotationGenerating = (annotation: Annotation) => annotation.status === 'generating' || annotation.reask?.status === 'generating';
