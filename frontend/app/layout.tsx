import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { Toaster } from '@/components/ui/toaster'
import { NavigationProgress } from '@/components/layout/navigation-progress'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
    title: 'CRM Admin Panel | Student Management',
    description: 'Powerful CRM for managing millions of student records with lead tracking and Excel import capabilities.',
    keywords: ['CRM', 'Student Management', 'Admin Panel', 'Lead Management', 'Education'],
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
