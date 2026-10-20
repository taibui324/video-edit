import type { Token } from './domain.ts';

export const transcriptLanguages = ['auto', 'en', 'vi', 'es', 'fr', 'de', 'ja', 'ko', 'zh'] as const;
export interface TranscriptResult { tokens: Token[]; language: string; languageProbability: number; provenance?: { runtime: string; modelSha256: string } }
export interface Transcription {
  id: string; projectId: string; revision: number; assetId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  language: string; model: string; createdAt: string; result?: TranscriptResult; error?: string;
}
export interface TranscriptionStatus { available: boolean; model: string; error?: string }
