import { type NextRequest, NextResponse } from "next/server";

// Protect all /api/v1/me/* routes — verify Bearer token with Supabase before
// the route handler runs. This is a second layer on top of per-route auth checks.
export const config = {
  matcher: ["/api/v1/me/:path*"],
};

export async function proxy(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Authentication required" } },
      { status: 401 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    // Supabase not configured (dev without .env) — let the route handler decide.
    return NextResponse.next();
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: { code: "unauthorized", message: "Invalid or expired token" } },
        { status: 401 },
      );
    }
  } catch {
    // Supabase unreachable — fail closed.
    return NextResponse.json(
      { error: { code: "service_unavailable", message: "Auth service unavailable" } },
      { status: 503 },
    );
  }

  return NextResponse.next();
}
