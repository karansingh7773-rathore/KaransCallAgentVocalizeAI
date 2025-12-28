/**
 * Vercel Serverless Function for LiveKit Token Generation
 * 
 * This is the API route that runs on Vercel.
 * Path: /api/token
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AccessToken } from 'livekit-server-sdk';

interface TokenRequest {
    userName: string;
    persona?: string;
    businessDetails?: string;
}

/**
 * Generate a unique room name using UUID
 */
function generateRoomName(): string {
    return `vocalize-${crypto.randomUUID()}`;
}

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { userName, persona = '', businessDetails = '' } = req.body as TokenRequest;

        if (!userName) {
            return res.status(400).json({ error: 'userName is required' });
        }

        // Get environment variables
        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const serverUrl = process.env.LIVEKIT_URL;

        if (!apiKey || !apiSecret || !serverUrl) {
            console.error('Missing LiveKit environment variables');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Generate unique room name for this user session
        const roomName = generateRoomName();

        // Create metadata to pass to the agent
        const metadata = JSON.stringify({
            userName,
            persona,
            businessDetails,
        });

        // Create access token
        const token = new AccessToken(apiKey, apiSecret, {
            identity: userName,
            metadata,
            ttl: '1h',
        });

        token.addGrant({
            room: roomName,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        });

        const jwt = await token.toJwt();

        // Return token and room info
        return res.status(200).json({
            token: jwt,
            roomName,
            serverUrl,
        });

    } catch (error) {
        console.error('Token generation error:', error);
        return res.status(500).json({ error: 'Failed to generate token' });
    }
}
