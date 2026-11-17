import './globals.css';
import './ads-styles.css';
export const metadata = { title: 'Tossdown Ads Intelligence', description: 'Evidence-first advertising audits and competitor creative research.' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
