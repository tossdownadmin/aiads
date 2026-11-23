import type { Metadata } from 'next';
import { BRAND_ICON_MIME_TYPE, BRAND_ICON_PATH, BRAND_ICON_SIZE } from '../lib/ui/brand-icon';
import './globals.css';
import './ads-styles.css';
import './craft-competitors.css';
import './workspace.css';
import './brand.css';
import './agency-ui.css';
export const metadata: Metadata = {
  title: 'Tossdown Ads Intelligence',
  description: 'Evidence-first advertising audits and competitor creative research.',
  icons: {
    icon: { url: BRAND_ICON_PATH, type: BRAND_ICON_MIME_TYPE, sizes: `${BRAND_ICON_SIZE}x${BRAND_ICON_SIZE}` },
    shortcut: BRAND_ICON_PATH,
  },
};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body className="agency-ui">{children}</body></html>; }
