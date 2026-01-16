/**
 * Development Server
 * 
 * This server provides the /api/token endpoint for local development.
 * In production on Vercel, this is handled by the serverless function.
 */

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';
import { google } from 'googleapis';

// Load environment variables
config({ path: '.env.local' });

// Google Sheets helper function
async function appendUserToSheet(userName: string): Promise<boolean> {
    try {
        const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
        const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
        // Fix: Handle both escaped \\n and literal \n in the private key
        let privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
        if (privateKey) {
            // Replace escaped newlines with actual newlines
            privateKey = privateKey.replace(/\\n/g, '\n');
        }

        console.log('📊 Sheets config:', {
            spreadsheetId: spreadsheetId ? `${spreadsheetId.substring(0, 10)}...` : 'MISSING',
            clientEmail: clientEmail || 'MISSING',
            privateKey: privateKey ? `${privateKey.substring(0, 30)}...` : 'MISSING',
        });

        if (!spreadsheetId || !clientEmail || !privateKey) {
            console.warn('Google Sheets credentials not configured - skipping user logging');
            return false;
        }

        const auth = new google.auth.JWT({
            email: clientEmail,
            key: privateKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        const timestamp = new Date().toISOString();

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Sheet1!A:B', // Columns A (timestamp) and B (username)
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[timestamp, userName]],
            },
        });

        console.log(`📊 User logged to spreadsheet: ${userName}`);
        return true;
    } catch (error: any) {
        console.error('Failed to log user to spreadsheet:', error?.message || error);
        return false;
    }
}

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
        const { userName, persona = '', businessDetails = '', language = 'en' } = req.body;

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
        console.log(`Creating room: ${roomName} for user: ${userName} (language: ${language})`);

        // Create metadata for agent
        const metadata = JSON.stringify({
            userName,
            persona,
            businessDetails,
            language,
        });

        // Initialize AgentDispatchClient for explicit agent dispatch
        const agentDispatch = new AgentDispatchClient(serverUrl, apiKey, apiSecret);

        // Dispatch the agent to the room
        // This ensures the 'vocalize-ai' agent joins when the user connects
        try {
            const dispatchId = await agentDispatch.createDispatch(roomName, 'vocalize-ai', {
                metadata: metadata,  // Pass user metadata to agent
            });
            console.log(`Agent dispatch created: ${dispatchId} for room: ${roomName}`);
        } catch (dispatchError: any) {
            console.error('Agent dispatch failed:', dispatchError);
            // Continue anyway - the room will still be created, just without agent
        }

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

// Log user to Google Sheets endpoint
app.post('/api/sheets', async (req, res) => {
    try {
        const { userName } = req.body;

        if (!userName) {
            return res.status(400).json({ error: 'userName is required' });
        }

        const success = await appendUserToSheet(userName);

        res.json({
            success,
            message: success ? 'User logged to spreadsheet' : 'Spreadsheet not configured'
        });
    } catch (error) {
        console.error('Sheets endpoint error:', error);
        res.status(500).json({ error: 'Failed to log user' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 Development API server running on http://localhost:${PORT}`);
    console.log(`   Token endpoint: http://localhost:${PORT}/api/token`);
    console.log(`   Sheets endpoint: http://localhost:${PORT}/api/sheets`);
    console.log(`\n📝 Environment variables in .env.local:`);
    console.log(`   - LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL`);
    console.log(`   - GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY`);
    console.log(`\n💡 Run 'npm run dev' in another terminal to start the frontend\n`);
});
