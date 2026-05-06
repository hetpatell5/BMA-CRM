'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Manrope } from 'next/font/google'
import { Mail, Lock, Loader2, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/authStore'
import { authAPI } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

const supportFont = Manrope({ subsets: ['latin'], weight: ['500', '600', '700', '800'] })

export default function LoginPage() {
    const router = useRouter()
    const { login } = useAuthStore()
    const { toast } = useToast()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [rememberMe, setRememberMe] = useState(true)
    const [isLoading, setIsLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!email || !password) {
            toast({
                title: 'Error',
                description: 'Please enter email and password',
                variant: 'destructive',
            })
            return
        }

        setIsLoading(true)

        try {
            const response = await authAPI.login(email, password)
            const { token, user } = response.data.data

            login(user, token, rememberMe)

            toast({
                title: 'Welcome back!',
                description: `Logged in as ${user.fullName}`,
                variant: 'success',
            })

            router.push('/dashboard')
        } catch (error: any) {
            toast({
                title: 'Login failed',
                description: error.response?.data?.message || 'Invalid credentials',
                variant: 'destructive',
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated background */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-purple-100/40 to-slate-100 dark:from-slate-900 dark:via-purple-900/20 dark:to-slate-900 transition-colors duration-500" />
            <div className="absolute inset-0">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/30 dark:bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/30 dark:bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
            </div>

            {/* Login card */}
            <div className="relative w-full max-w-md">
                <div className="glass rounded-2xl p-8 shadow-2xl animate-fade-in relative z-10">
                    {/* Logo */}
                    <div className="flex flex-col items-center mb-8">
                        <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center mb-2">
                            <img 
                                src="/logo.png" 
                                alt="BMA CRM Logo" 
                                className="w-full h-full object-contain drop-shadow-sm"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                }}
                            />
                        </div>
                        <div className="flex items-center whitespace-nowrap mb-1">
                            <span className={`text-[2rem] font-bold text-slate-800 dark:text-[#b8bfc6] leading-none ${supportFont.className}`}>BMA</span>
                            <span className={`text-[2rem] font-bold text-slate-500 dark:text-[#b8bfc6] leading-none ml-1.5 ${supportFont.className}`}>CRM</span>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm font-medium">Student Management System</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-sm text-muted-foreground">
                                Email Address
                            </Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="admin@crm.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="pl-10 h-12 bg-white/5 border-white/10 focus:border-primary"
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-sm text-muted-foreground">
                                Password
                            </Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-10 h-12 bg-white/5 border-white/10 focus:border-primary"
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="rememberMe"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary bg-white/5"
                                disabled={isLoading}
                            />
                            <Label htmlFor="rememberMe" className="text-sm text-muted-foreground cursor-pointer font-normal">
                                Remember me
                            </Label>
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-12 text-base"
                            variant="gradient"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                <>
                                    <LogIn className="w-5 h-5 mr-2" />
                                    Sign In
                                </>
                            )}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    )
}
