import type { Response } from 'express';
import type { AppConfig } from '../../config/env.js';

export const SESSION_COOKIE = 'open_loops_session';

/**
 * `httpOnly` keeps the token out of reach of any script on the page, and `sameSite: lax` still
 * arrives on the top-level redirect Composio sends the browser back on after consent, which a
 * `strict` cookie would drop. `secure` is off only in LOCAL mode, where the app is plain HTTP
 * on a LAN address and a secure cookie would never be stored at all.
 */
export const setSessionCookie = (
  response: Response,
  input: { token: string; config: AppConfig },
): void => {
  response.cookie(SESSION_COOKIE, input.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: input.config.OPEN_LOOPS_MODE === 'HOSTED',
    path: '/',
    maxAge: input.config.AUTH_SESSION_TTL_HOURS * 60 * 60 * 1000,
  });
};

export const clearSessionCookie = (response: Response, config: AppConfig): void => {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.OPEN_LOOPS_MODE === 'HOSTED',
    path: '/',
  });
};
