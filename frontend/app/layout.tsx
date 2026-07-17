import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import 'react-quill/dist/quill.snow.css'
import { Providers } from '@/components/providers'
import { Toaster } from '@/components/ui/toaster'
import { NavigationProgress } from '@/components/layout/navigation-progress'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
    title: 'BMA CRM',
    description: 'BMA CRM',
    icons: {
        icon: '/logo.png',
        shortcut: '/logo.png',
        apple: '/logo.png',
    },
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <body className={`${inter.variable} font-sans antialiased`}>
                <Providers>
                    <NavigationProgress />
                    {children}
                    <Toaster />
                </Providers>
            </body>
        </html>
    )
}
