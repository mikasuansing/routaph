import './globals.css';
import { ThemeProvider, ThemeToggle } from './providers';
import { ServiceWorker } from './components/ServiceWorker';

export const metadata = {
  title: 'ParaPo — Metro Manila Commute Intelligence',
  description: 'Plan Metro Manila commutes across MRT, LRT, bus, and jeepney — fares, ETAs, and live trip tracking.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
  appleWebApp: { title: 'ParaPo', statusBarStyle: 'black-translucent' },
};

export const viewport = {
  themeColor: '#2947DE',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <ThemeProvider>
          {children}
          <ThemeToggle />
        </ThemeProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
