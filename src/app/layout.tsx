import type { Metadata, Viewport } from 'next';
import './globals.css';
import './radar-v4.css';
import { WhatsAppWorkspaceProvider } from '@/components/WhatsAppWorkspaceProvider';
import { PlanProvider } from '@/components/PlanProvider';
import { AppShell } from '@/components/AppShell';
import { CookieConsent } from '@/components/legal/CookieConsent';

export const metadata: Metadata = {
  title: 'Radar de Ofertas — Painel de Afiliados',
  description:
    'Sistema inteligente de garimpo, curadoria, conversão e publicação de ofertas no WhatsApp.',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Geist:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap"
        />
      </head>
      <body className="antialiased">
        <PlanProvider>
          <WhatsAppWorkspaceProvider>
            <AppShell>{children}</AppShell>
            <CookieConsent />
          </WhatsAppWorkspaceProvider>
        </PlanProvider>
      </body>
    </html>
  );
}
