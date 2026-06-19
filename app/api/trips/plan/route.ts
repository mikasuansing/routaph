import { NextRequest, NextResponse } from 'next/server';
import { planTrip } from '@/lib/demoNetwork';

export async function POST(req: NextRequest) {
  const { from, to } = await req.json();
  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 });
  const result = planTrip(from, to);
  if (!result) return NextResponse.json({ error: 'No route found between those stops' }, { status: 404 });
  return NextResponse.json({ ...result, seeded: true });
}
