/**
 * LiveKit Token Generation API
 * 
 * This serverless function generates access tokens for LiveKit rooms.
 * Each request creates a unique room name to ensure users don't connect to each other.
 * 
 * For Vercel deployment, this file should be at: api/token/route.ts (Next.js App Router)
 * or api/token.ts (Pages Router / Vite with Vercel adapter)
 */

// For Vite/Express development server
export interface TokenRequest {
    userName: string;
    persona?: string;
    businessDetails?: string;
    language?: 'en' | 'hi';
}

export interface TokenResponse {
    token: string;
    roomName: string;
    serverUrl: string;
}

/**
 * Generate a unique room name
 * Uses UUID to ensure each user gets their own room
 */
export function generateRoomName(): string {
    // Use crypto.randomUUID if available, otherwise fallback
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `vocalize-${crypto.randomUUID()}`;
    }
    // Fallback for older environments
    return `vocalize-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create LiveKit access token
 * In production, this uses the livekit-server-sdk
 */
export async function createToken(
    roomName: string,
    identity: string,
    metadata: string
): Promise<string> {
    // Dynamic import for server-side only
    const { AccessToken } = await import('livekit-server-sdk');

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
        throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set');
    }

    const token = new AccessToken(apiKey, apiSecret, {
        identity,
        metadata,
        ttl: '1h', // Token valid for 1 hour
    });

    token.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
    });

    return await token.toJwt();
}

/**
 * Handle token request
 * Used by the development server
 */
export async function handleTokenRequest(body: TokenRequest): Promise<TokenResponse> {
    const { userName, persona = '', businessDetails = '', language = 'en' } = body;

    if (!userName) {
        throw new Error('userName is required');
    }

    const roomName = generateRoomName();
    const serverUrl = process.env.LIVEKIT_URL || '';

    if (!serverUrl) {
        throw new Error('LIVEKIT_URL must be set');
    }

    // Create metadata object to pass to agent
    const metadata = JSON.stringify({
        userName,
        persona,
        businessDetails,
        language,
    });

    const token = await createToken(roomName, userName, metadata);

    return {
        token,
        roomName,
        serverUrl,
    };
}
