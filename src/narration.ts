export interface Voice { id: string; name: string; language: string }
export interface NarrationInput { text: string; voice: string; speed: number }
export interface VoiceProvenance { runtime: string; checksums: Record<string, string>; sampleRate: number }
export interface Narration extends NarrationInput {
  id: string; createdAt: string; model: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  error?: string; assetId?: string; duration?: number; provenance?: VoiceProvenance;
}
export interface NarrationConnection { available: boolean; model: string; voices: Voice[]; error?: string }
