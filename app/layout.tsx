import './globals.css';
import { ThemeProvider, ThemeToggle } from './providers';

export const metadata = {
  title: 'ParaPo — Metro Manila Commute Intelligence',
  description: 'Plan Metro Manila commutes across MRT, LRT, bus, and jeepney — fares, ETAs, and live trip tracking.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

export const viewport = {
  themeColor: '#2947DE',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <ThemeProvider>
          {children}
          <ThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}
