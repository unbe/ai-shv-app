import crypto from 'crypto';

// In-memory PKCE challenge store: state -> { verifier, createdAt }
const pkceStore = new Map();

// In-memory sessions store: sid -> { sid, accessToken, refreshToken, expiresAt, claims, profile }
const sessionsStore = new Map();

// Clean up expired PKCE requests (older than 15 minutes)
function cleanExpiredPkce() {
  const now = Date.now();
  for (const [state, entry] of pkceStore.entries()) {
    if (now - entry.createdAt > 15 * 60 * 1000) {
      pkceStore.delete(state);
    }
  }
}

export function startAuth() {
  cleanExpiredPkce();
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('base64url');

  pkceStore.set(state, {
    verifier,
    createdAt: Date.now(),
  });

  const authUrl = `https://login.shv-fsvl.ch/realms/SHV/protocol/openid-connect/auth?client_id=app-android&redirect_uri=https%3A%2F%2Fprod.shv-app.ch%2Foidc%2Fcallback&response_type=code&scope=openid%20offline_access&code_challenge=${challenge}&code_challenge_method=S256&state=${state}&prompt=login`;

  return {
    authUrl,
    state,
  };
}

export function decodeJwt(jwt) {
  if (!jwt || typeof jwt !== 'string') return null;
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    const jsonStr = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

async function fetchMemberProfile(accessToken) {
  if (!accessToken) return null;
  try {
    // 1. Primary endpoint: individual pilot profile
    let resp = await fetch('https://shv-app-ws-prod.shv-app.ch/v1/wms/person', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (resp.ok) {
      return await resp.json();
    }

    // 2. Fallback endpoint: company/club/school profile if 403
    if (resp.status === 403) {
      console.log('[Auth] v1/wms/person returned 403, falling back to v1/wms/company...');
      resp = await fetch('https://shv-app-ws-prod.shv-app.ch/v1/wms/company', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      if (resp.ok) {
        return await resp.json();
      }
    }
    console.warn('[Auth] Upstream profile response status:', resp.status);
    return null;
  } catch (err) {
    console.error('[Auth] Error fetching member profile from upstream ws:', err.message);
    return null;
  }
}

export async function exchangeCode({ callbackUrl, code, state }) {
  cleanExpiredPkce();

  let parsedCode = code;
  let parsedState = state;

  if (callbackUrl) {
    try {
      const parsed = new URL(callbackUrl.trim());
      parsedCode = parsed.searchParams.get('code') || parsedCode;
      parsedState = parsed.searchParams.get('state') || parsedState;
    } catch {
      // Fallback regex matching in case user pastes raw query string or snippet
      const mCode = callbackUrl.match(/code=([^&]+)/);
      const mState = callbackUrl.match(/state=([^&]+)/);
      if (mCode) parsedCode = decodeURIComponent(mCode[1]);
      if (mState) parsedState = decodeURIComponent(mState[1]);
    }
  }

  if (!parsedCode) {
    throw new Error('Kein Authorization-Code gefunden. Bitte stelle sicher, dass die vollständige URL der Seite "Anmeldung erfolgreich" kopiert wurde.');
  }

  if (!parsedState) {
    throw new Error('Kein State-Parameter gefunden.');
  }

  const stored = pkceStore.get(parsedState);
  if (!stored) {
    throw new Error('Ungültiger oder abgelaufener Login-Status (State). Bitte klicke erneut auf "Mit SHV-Konto anmelden", um einen frischen Login zu starten.');
  }

  // State is single-use
  pkceStore.delete(parsedState);

  // Exchange authorization code for tokens with Keycloak
  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: 'app-android',
    code: parsedCode,
    redirect_uri: 'https://prod.shv-app.ch/oidc/callback',
    code_verifier: stored.verifier,
  });

  const tokenResp = await fetch('https://login.shv-fsvl.ch/realms/SHV/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString(),
  });

  const tokens = await tokenResp.json();
  if (!tokenResp.ok) {
    const errorMsg = tokens.error_description || tokens.error || `Keycloak token error (HTTP ${tokenResp.status})`;
    throw new Error(`Token-Austausch fehlgeschlagen: ${errorMsg}`);
  }

  const claims = decodeJwt(tokens.id_token) || decodeJwt(tokens.access_token) || {};
  const profile = await fetchMemberProfile(tokens.access_token);

  const sid = crypto.randomBytes(24).toString('base64url');
  sessionsStore.set(sid, {
    sid,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + ((tokens.expires_in || 300) * 1000),
    claims,
    profile,
  });

  return {
    sid,
    claims,
    profile,
  };
}

export async function getSession(sid) {
  if (!sid) return null;
  const session = sessionsStore.get(sid);
  if (!session) return null;

  // Refresh token if nearing expiry (within 60s)
  if (session.expiresAt && Date.now() >= session.expiresAt - 60000 && session.refreshToken) {
    try {
      const refreshParams = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'app-android',
        refresh_token: session.refreshToken,
      });

      const rResp = await fetch('https://login.shv-fsvl.ch/realms/SHV/protocol/openid-connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: refreshParams.toString(),
      });

      if (rResp.ok) {
        const rTokens = await rResp.json();
        session.accessToken = rTokens.access_token;
        if (rTokens.refresh_token) session.refreshToken = rTokens.refresh_token;
        session.expiresAt = Date.now() + ((rTokens.expires_in || 300) * 1000);
      }
    } catch (e) {
      console.warn('[Auth] Token refresh error:', e.message);
    }
  }

  // Refresh profile if missing
  if (!session.profile && session.accessToken) {
    session.profile = await fetchMemberProfile(session.accessToken);
  }

  return {
    sid: session.sid,
    claims: session.claims,
    profile: session.profile,
  };
}

export function logoutSession(sid) {
  if (!sid) return false;
  return sessionsStore.delete(sid);
}
