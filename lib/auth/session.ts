export const SESSION_COOKIE_NAME = 'parapo_session';

function serializeSessionCookie(value: string, maxAge: number): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function setSessionCookie(res: Response, token: string) {
  res.headers.append('Set-Cookie', serializeSessionCookie(token, 60 * 60 * 24 * 7));
  return res;
}

export function clearSessionCookie(res: Response) {
  res.headers.append('Set-Cookie', serializeSessionCookie('', 0));
  return res;
}
