import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { BottomNav } from '@/components/BottomNav';
import { Header } from '@/components/Header';
import { WhatsAppAlertBanner } from '@/components/WhatsAppAlertBanner';

export const metadata: Metadata = {
  title: 'Radar de Ofertas — Painel de Afiliados WhatsApp',
  description:
    'Sistema inteligente mobile-first de garimpo, curadoria, conversão e publicação de ofertas no WhatsApp.',
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
      <body className="bg-[#061225] text-[#F8FBFF] min-h-screen antialiased flex flex-col selection:bg-[#1CCAF2]/30 selection:text-[#F8FBFF]">
        {/* Desktop Sidebar */}
        <Sidebar />

        {/* Main Content Area: Compact on tablet (md), Full on desktop (xl) */}
        <div className="flex-1 flex flex-col md:pl-20 xl:pl-64 min-w-0">
          <Header />
          <WhatsAppAlertBanner />
          <main className="flex-1 p-3.5 sm:p-5 lg:p-6 pb-24 md:pb-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>

        {/* Mobile Bottom Navigation */}
        <BottomNav />
      </body>
    </html>
  );
}
