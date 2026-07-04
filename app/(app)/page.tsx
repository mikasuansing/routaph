import { redirect } from 'next/navigation';

// The product lives at /planner (guest-first). The root URL previously
// rendered a stale design exploration; design-a/…/design-d remain reachable
// directly for reference.
export default function Home() {
  redirect('/planner');
}
