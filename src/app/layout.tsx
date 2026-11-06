import type { Metadata, Viewport } from 'next';
import { Playfair_Display } from 'next/font/google';
import './globals.css';
import { WhatsAppWorkspaceProvider } from '@/components/WhatsAppWorkspaceProvider';
import { PlanProvider } from '@/components/PlanProvider';
import { AppShell } from '@/components/AppShell';

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-serif-pricing',
  display: 'swap',
});

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
    <html lang="pt-BR" className={playfairDisplay.variable}>
      <body className="antialiased">
        <PlanProvider>
          <WhatsAppWorkspaceProvider>
            <AppShell>{children}</AppShell>
          </WhatsAppWorkspaceProvider>
        </PlanProvider>
      </body>
    </html>
  );
}
