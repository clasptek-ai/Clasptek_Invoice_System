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

function isPreviewEnv(): boolean {
  return process.env.VERCEL_ENV === 'preview' || process.env.CLASPTEK_ENV === 'preview';
}

function assertLiveKitStagingAllowed(action: string = 'operation'): void {
  if (process.env.STAGING_LIVEKIT_ALLOW_LIVE !== 'true') {
    const err: any = new Error(
      `LIVEKIT_PREVIEW_DENIED: LiveKit ${action} is denied in Preview environment. ` +
      `Enable mock mode (LIVEKIT_MOCK_ENABLED=true) or configure certified isolated staging credentials.`
    );
    err.code = 'LIVEKIT_PREVIEW_DENIED';
    err.statusCode = 503;
    throw err;
  }

  const stagingUrl = (process.env.STAGING_LIVEKIT_URL || '').trim();
  const stagingKey = (process.env.STAGING_LIVEKIT_API_KEY || '').trim();
  const stagingSecret = (process.env.STAGING_LIVEKIT_API_SECRET || '').trim();

  if (!stagingUrl || !stagingKey || !stagingSecret) {
    const err: any = new Error(
      `LIVEKIT_PREVIEW_CONFIG_ERROR: STAGING_LIVEKIT_ALLOW_LIVE requires explicit STAGING_LIVEKIT_URL, ` +
      `STAGING_LIVEKIT_API_KEY, and STAGING_LIVEKIT_API_SECRET. Inherited production credentials cannot be used.`
    );
    err.code = 'LIVEKIT_PREVIEW_CONFIG_ERROR';
    err.statusCode = 503;
    throw err;
  }

  const prodUrl = (process.env.LIVEKIT_URL || '').trim();
  const prodKey = (process.env.LIVEKIT_API_KEY || '').trim();
  const prodSecret = (process.env.LIVEKIT_API_SECRET || '').trim();

  if (prodUrl && stagingUrl.toLowerCase() === prodUrl.toLowerCase()) {
    const err: any = new Error('LIVEKIT_PREVIEW_CONFIG_ERROR: STAGING_LIVEKIT_URL cannot match production LIVEKIT_URL.');
    err.code = 'LIVEKIT_PREVIEW_CONFIG_ERROR';
    err.statusCode = 503;
    throw err;
  }

  if ((prodKey && stagingKey === prodKey) || (prodSecret && stagingSecret === prodSecret)) {
    const err: any = new Error('LIVEKIT_PREVIEW_CONFIG_ERROR: Staging LiveKit credentials cannot match production credentials.');
    err.code = 'LIVEKIT_PREVIEW_CONFIG_ERROR';
    err.statusCode = 503;
    throw err;
  }

  let parsed: URL;
  try {
    parsed = new URL(stagingUrl.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://'));
  } catch {
    const err: any = new Error('LIVEKIT_PREVIEW_CONFIG_ERROR: STAGING_LIVEKIT_URL is not a valid URL.');
    err.code = 'LIVEKIT_PREVIEW_CONFIG_ERROR';
    err.statusCode = 503;
    throw err;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname.includes('app.clasptek.org') || hostname.includes('production')) {
    const err: any = new Error('LIVEKIT_PREVIEW_CONFIG_ERROR: STAGING_LIVEKIT_URL cannot target production domains.');
    err.code = 'LIVEKIT_PREVIEW_CONFIG_ERROR';
    err.statusCode = 503;
    throw err;
  }

  const isApprovedStagingHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('staging-') ||
    hostname.includes('.staging.') ||
    hostname.endsWith('.local');

  if (!isApprovedStagingHost) {
    const err: any = new Error(
      `LIVEKIT_PREVIEW_CONFIG_ERROR: STAGING_LIVEKIT_URL host '${hostname}' is not on the certified staging endpoint allowlist.`
    );
    err.code = 'LIVEKIT_PREVIEW_CONFIG_ERROR';
    err.statusCode = 503;
    throw err;
  }
}

export class LiveKitService {
  private url: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(config: { url?: string; apiKey?: string; apiSecret?: string } = {}) {
    const isPreview = isPreviewEnv();

    if (isPreview && process.env.LIVEKIT_MOCK_ENABLED === 'true') {
      this.url = 'wss://mock-preview-livekit.local';
      this.apiKey = 'mock_preview_key';
      this.apiSecret = 'mock_preview_secret';
      return;
    }

    if (isPreview && process.env.STAGING_LIVEKIT_ALLOW_LIVE === 'true') {
      assertLiveKitStagingAllowed('initialization');
      this.url = (process.env.STAGING_LIVEKIT_URL || '').trim();
      this.apiKey = (process.env.STAGING_LIVEKIT_API_KEY || '').trim();
      this.apiSecret = (process.env.STAGING_LIVEKIT_API_SECRET || '').trim();
      return;
    }

    const rawUrl = (config.url || process.env.LIVEKIT_URL || '').trim();
    const rawKey = (config.apiKey || process.env.LIVEKIT_API_KEY || '').trim();
    const rawSecret = (config.apiSecret || process.env.LIVEKIT_API_SECRET || '').trim();

    if (!rawUrl || !rawKey || !rawSecret) {
      const missing: string[] = [];
      if (!rawUrl) missing.push('LIVEKIT_URL');
      if (!rawKey) missing.push('LIVEKIT_API_KEY');
      if (!rawSecret) missing.push('LIVEKIT_API_SECRET');
      throw new Error(`CONFIGURATION_ERROR: LiveKit configuration missing: ${missing.join(', ')}. LiveKit connections require explicit configuration.`);
    }

    this.url = rawUrl;
    this.apiKey = rawKey;
    this.apiSecret = rawSecret;
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
    if (isPreviewEnv()) {
      if (process.env.LIVEKIT_MOCK_ENABLED === 'true') {
        return {
          success: true,
          provider: 'mock',
          roomId: params.roomId,
          roomTitle: params.roomTitle,
          serverUrl: 'wss://mock-preview-livekit.local',
          emptyTimeout: params.settings?.emptyTimeout || 300,
          maxParticipants: params.settings?.maxParticipants || 100,
        };
      }
      assertLiveKitStagingAllowed('createRoom');
    }

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
    ttlSeconds?: number;
    canPublish?: boolean;
  }): Promise<ParticipantTokenResult> {
    const isGuest = params.role === 'GUEST';

    if (isPreviewEnv()) {
      if (process.env.LIVEKIT_MOCK_ENABLED === 'true') {
        return {
          token: `mock_preview_jwt_${crypto.randomBytes(16).toString('hex')}`,
          serverUrl: 'wss://mock-preview-livekit.local',
          roomId: params.roomId,
          participantId: params.participantId,
          participantName: params.participantName,
          role: params.role || (isGuest ? 'GUEST' : 'STUDENT'),
          isHost: Boolean(params.isHost),
          provider: 'livekit',
        };
      }
      assertLiveKitStagingAllowed('generateParticipantToken');
    }
    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = params.ttlSeconds || (isGuest ? 2 * 60 * 60 : 6 * 60 * 60);

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
        canPublish: params.canPublish === false ? false : true, // canPublish: true
        canSubscribe: true,
        canPublishData: true,
        roomAdmin: Boolean(params.isHost) && !isGuest,
        roomCreate: Boolean(params.isHost) && !isGuest,
      },
      metadata: JSON.stringify({
        role: params.role || (isGuest ? 'GUEST' : 'STUDENT'),
        isHost: Boolean(params.isHost) && !isGuest,
        displayName: params.participantName,
      }),
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const signature = crypto
      .createHmac('sha256', this.apiSecret)
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

/** Reset singleton for testing */
export function resetSFUService(): void {
  sfuInstance = null;
}
