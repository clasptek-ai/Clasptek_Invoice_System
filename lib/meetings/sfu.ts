/**
 * lib/meetings/sfu.ts — Phase 5
 * Server-side SFU provider abstraction & token generator for LiveKit.
 * Uses native Node.js crypto for zero-dependency HS256 JWT generation.
 */

import crypto from 'crypto';

function base64UrlEncode(strOrBuffer: string | Buffer): string {
  const buf = Buffer.isBuffer(strOrBuffer) ? strOrBuffer : Buffer.from(strOrBuffer);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export interface SFURoomResult {
  success: boolean;
  provider: string;
  roomId: string;
  roomTitle: string;
  serverUrl: string;
  emptyTimeout: number;
  maxParticipants: number;
}

export interface ParticipantTokenResult {
  token: string;
  serverUrl: string;
  roomId: string;
  participantId: string;
  participantName: string;
  role: string;
  isHost: boolean;
  provider: string;
}

export class LiveKitService {
  private url: string;
  private apiKey: string;
  private apiSecret: string;

  constructor() {
    this.url = process.env.LIVEKIT_URL || 'wss://clasptek-portal-tpfi0pb9.livekit.cloud';
    this.apiKey = process.env.LIVEKIT_API_KEY || '';
    this.apiSecret = process.env.LIVEKIT_API_SECRET || '';
  }

  get provider(): string {
    return 'livekit';
  }

  get serverUrl(): string {
    return this.url;
  }

  async createRoom(params: {
    roomId: string;
    roomTitle: string;
    settings?: { emptyTimeout?: number; maxParticipants?: number };
  }): Promise<SFURoomResult> {
    return {
      success: true,
      provider: 'livekit',
      roomId: params.roomId,
      roomTitle: params.roomTitle,
      serverUrl: this.url,
      emptyTimeout: params.settings?.emptyTimeout || 300,
      maxParticipants: params.settings?.maxParticipants || 100,
    };
  }

  async generateParticipantToken(params: {
    roomId: string;
    participantId: string;
    participantName: string;
    isHost?: boolean;
    role?: string;
  }): Promise<ParticipantTokenResult> {
    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = 6 * 60 * 60; // 6 hours

    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      sub: params.participantId,
      iss: this.apiKey,
      nbf: now - 5,
      exp: now + ttlSeconds,
      name: params.participantName,
      video: {
        room: params.roomId,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        roomAdmin: Boolean(params.isHost),
        roomCreate: Boolean(params.isHost),
      },
      metadata: JSON.stringify({
        role: params.role || 'STUDENT',
        isHost: Boolean(params.isHost),
        displayName: params.participantName,
      }),
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const signature = crypto
      .createHmac('sha256', this.apiSecret || 'dev-secret-fallback')
      .update(dataToSign)
      .digest();
    const encodedSignature = base64UrlEncode(signature);
    const token = `${dataToSign}.${encodedSignature}`;

    return {
      token,
      serverUrl: this.url,
      roomId: params.roomId,
      participantId: params.participantId,
      participantName: params.participantName,
      role: params.role || 'STUDENT',
      isHost: Boolean(params.isHost),
      provider: 'livekit',
    };
  }
}

// Singleton instance
let sfuInstance: LiveKitService | null = null;
export function getSFUService(): LiveKitService {
  if (!sfuInstance) {
    sfuInstance = new LiveKitService();
  }
  return sfuInstance;
}
