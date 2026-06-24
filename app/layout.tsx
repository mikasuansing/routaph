import './globals.css';
import { ThemeProvider, ThemeToggle } from './providers';

export const metadata = { title: 'ParaPo — Metro Manila Commute Intelligence' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          {children}
          <ThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}
