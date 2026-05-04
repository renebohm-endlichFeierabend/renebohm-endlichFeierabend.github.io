import type { DriveConfig } from '../types';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token: string; expires_in: number; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

function loadGisScript(): Promise<void> {
  return new Promise((resolve) => {
    if (window.google?.accounts) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

export async function requestGoogleToken(clientId: string): Promise<DriveConfig> {
  await loadGisScript();

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: async (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        const email = await fetchUserEmail(resp.access_token);
        resolve({
          clientId,
          accessToken: resp.access_token,
          tokenExpiry: Date.now() + resp.expires_in * 1000,
          userEmail: email,
        });
      },
    });
    client.requestAccessToken();
  });
}

async function fetchUserEmail(token: string): Promise<string> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.email ?? '';
  } catch {
    return '';
  }
}

export function isTokenValid(config: DriveConfig | null | undefined): boolean {
  if (!config) return false;
  return !!config.accessToken && !!config.tokenExpiry && config.tokenExpiry > Date.now() + 60_000;
}
