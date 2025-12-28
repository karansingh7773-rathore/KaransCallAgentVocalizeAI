/**
 * Development Server
 * 
 * This server provides the /api/token endpoint for local development.
 * In production on Vercel, this is handled by the serverless function.
 */

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { AccessToken } from 'livekit-server-sdk';

// Load environment variables
config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Generate unique room name
function generateRoomName(): string {
    return `vocalize-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Token endpoint
app.post('/api/token', async (req, res) => {
    try {
        const { userName, persona = '', businessDetails = '' } = req.body;

        if (!userName) {
            return res.status(400).json({ error: 'userName is required' });
        }

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const serverUrl = process.env.LIVEKIT_URL;

        if (!apiKey || !apiSecret || !serverUrl) {
            console.error('Missing LiveKit environment variables');
            console.error('LIVEKIT_API_KEY:', apiKey ? 'set' : 'missing');
            console.error('LIVEKIT_API_SECRET:', apiSecret ? 'set' : 'missing');
            console.error('LIVEKIT_URL:', serverUrl ? 'set' : 'missing');
            return res.status(500).json({ error: 'Server configuration error - check environment variables' });
        }

        // Generate unique room name
        const roomName = generateRoomName();
        console.log(`Creating room: ${roomName} for user: ${userName}`);

        // Create metadata for agent
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

        console.log(`Token generated for room: ${roomName}`);

        res.json({
            token: jwt,
            roomName,
            serverUrl,
        });

    } catch (error) {
        console.error('Token generation error:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 Development API server running on http://localhost:${PORT}`);
    console.log(`   Token endpoint: http://localhost:${PORT}/api/token`);
    console.log(`\n📝 Make sure to set these environment variables in .env.local:`);
    console.log(`   - LIVEKIT_API_KEY`);
    console.log(`   - LIVEKIT_API_SECRET`);
    console.log(`   - LIVEKIT_URL`);
    console.log(`\n💡 Run 'npm run dev' in another terminal to start the frontend\n`);
});
