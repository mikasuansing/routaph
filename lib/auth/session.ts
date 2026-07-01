import { serialize } from 'cookie';

export const SESSION_COOKIE_NAME = 'parapo_session';

export function setSessionCookie(res: Response, token: string) {
  const cookie = serialize(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  res.headers.append('Set-Cookie', cookie);
  return res;
}

export function clearSessionCookie(res: Response) {
  const cookie = serialize(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  res.headers.append('Set-Cookie', cookie);
  return res;
}
