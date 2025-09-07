import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { IBM_Plex_Sans_Hebrew } from 'next/font/google';
import './globals.css';

const geistSans = localFont({
    src: './fonts/GeistVF.woff',
    variable: '--font-geist-sans',
    weight: '100 900',
});
const geistMono = localFont({
    src: './fonts/GeistMonoVF.woff',
    variable: '--font-geist-mono',
    weight: '100 900',
});

const ibmPlexSansHebrew = IBM_Plex_Sans_Hebrew({
    subsets: ['hebrew', 'latin'],
    weight: ['400', '600', '700'],
    variable: '--font-ibm-plex-sans-hebrew',
    display: 'swap',
});

export const metadata: Metadata = {
    title: 'MOSS Canvas | Home',
    description: '',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body
                className={`${geistSans.variable} ${geistMono.variable} ${ibmPlexSansHebrew.variable} antialiased`}
            >
                {children}
            </body>
        </html>
    );
}