/**
 * Vercel API Route: /api/sheets
 * Logs user names to Google Spreadsheet
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';

async function appendUserToSheet(userName: string): Promise<boolean> {
    try {
        const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
        const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
        let privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

        if (privateKey) {
            // Replace escaped newlines with actual newlines
            privateKey = privateKey.replace(/\\n/g, '\n');
        }

        if (!spreadsheetId || !clientEmail || !privateKey) {
            console.warn('Google Sheets credentials not configured');
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
            range: 'Sheet1!A:B',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[timestamp, userName]],
            },
        });

        console.log(`User logged to spreadsheet: ${userName}`);
        return true;
    } catch (error: any) {
        console.error('Failed to log user:', error?.message || error);
        return false;
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { userName } = req.body;

        if (!userName) {
            return res.status(400).json({ error: 'userName is required' });
        }

        const success = await appendUserToSheet(userName);

        return res.json({
            success,
            message: success ? 'User logged to spreadsheet' : 'Spreadsheet not configured',
        });
    } catch (error) {
        console.error('Sheets endpoint error:', error);
        return res.status(500).json({ error: 'Failed to log user' });
    }
}
