import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set');
  // Fullwidth Unicode digits (U+FF10–FF19) can appear when the JSON is copied from
  // PDFs or certain UIs. Replace them with ASCII equivalents before parsing.
  const clean = raw.replace(/[０-９]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0xFEE0)
  );
  return JSON.parse(clean);
}

async function getAuth() {
  const auth = new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return auth;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sheet = searchParams.get('sheet') || 'CALENDARIO';

  try {
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: sheet,
    });

    return NextResponse.json({
      values: response.data.values || [],
    });
  } catch (error) {
    console.error('Google Sheets API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data from Google Sheets' },
      { status: 500 }
    );
  }
}
