import './globals.css';
import Navbar from '@/components/navbar';

export const metadata = { title: 'Dental Imaging Review', description: 'Dental X-ray decision support' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body>
    <div className="app-shell"><Navbar/><aside className="disclaimer"><span className="disclaimer-dot"/>Decision-support only — not a diagnosis. A qualified dentist must review all results.</aside>{children}</div>
  </body></html>;
}
