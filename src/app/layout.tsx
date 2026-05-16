import type { Metadata, Viewport } from 'next';
import { Nunito } from 'next/font/google';
import './globals.css';
import { StoreHydration } from '@/components/StoreHydration';
import { MapProvider } from '@/components/MapProvider';
import { AuthProvider } from '@/components/AuthProvider';
import { TravelpayoutsScript } from '@/components/TravelpayoutsScript';

const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://yoteitrip.vercel.app'),
  title: 'YoteiTrip',
  description: '模块化旅游日程规划工具',
  manifest: '/manifest.json',
  icons: {
    icon:  '/logoyt.jpeg',
    apple: '/logoyt.jpeg',
  },
  appleWebApp: {
    title:           'YoteiTrip',
    statusBarStyle:  'default',
    capable:         true,
    startupImage:    '/logoyt.jpeg',
  },
  // Open Graph for link previews when shared on social / iMessage
  openGraph: {
    title:       'YoteiTrip',
    description: '我正在用 YoteiTrip 规划行程，快来看看！',
    type:        'website',
    images:      [{ url: '/logoyt.jpeg', width: 512, height: 512 }],
  },
};

export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  viewportFit:  'cover',
  themeColor:   '#47BB8E',   // brand green — matches PWA manifest + browser chrome
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full bg-gray-50">
        <TravelpayoutsScript />
        <StoreHydration>
          <AuthProvider>
            <MapProvider>{children}</MapProvider>
          </AuthProvider>
        </StoreHydration>
      </body>
    </html>
  );
}
