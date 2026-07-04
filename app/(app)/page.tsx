import { redirect } from 'next/navigation';

// The product lives at /planner (login-gated there).
export default function Home() {
  redirect('/planner');
}
