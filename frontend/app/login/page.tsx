'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Lock, Loader2, User, EyeOff, Eye } from 'lucide-react'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { Manrope } from 'next/font/google'

const supportFont = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] })

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [rememberMe, setRememberMe] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const router = useRouter()
    const { login } = useAuthStore()
    const { toast } = useToast()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || !password) {
            toast({
                title: 'Error',
                description: 'Please enter both email and password',
                variant: 'destructive',
            })
            return
        }

        setIsLoading(true)

        try {
            const user = {
                id: '1',
                email: 'admin@crm.com',
                fullName: 'Admin User',
                role: 'ADMIN',
                status: 'ACTIVE'
            }
            const token = 'mock-jwt-token'

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
        <div className={`min-h-screen flex flex-col p-4 relative overflow-hidden bg-[#0d131a] ${supportFont.className}`}>
            {/* Background sweeping beam */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150vw] h-[60vh] -rotate-45 bg-gradient-to-b from-transparent via-blue-300/5 to-transparent blur-3xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150vw] h-[20vh] -rotate-45 bg-gradient-to-b from-transparent via-slate-100/5 to-transparent blur-2xl animate-[pan-bg_15s_linear_infinite] bg-[length:100%_200%]" />
            </div>

            <div className="flex-1 flex flex-col items-center justify-center z-10 w-full max-w-[440px] mx-auto animate-fade-in-up">
                
                {/* Header Logo */}
                <div className="flex flex-col items-center mb-10">
                    <div className="flex items-center justify-center mb-2">
                        <img 
                            src="/logo.png" 
                            alt="BMA CRM Logo" 
                            className="w-10 h-10 object-contain mr-2 filter brightness-0 invert opacity-90"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <div className="flex items-center whitespace-nowrap">
                            <span className="text-3xl font-bold text-white tracking-tight leading-none">BMA</span>
                            <span className="text-3xl font-light text-slate-300 leading-none ml-1">CRM</span>
                        </div>
                    </div>
                </div>

                {/* Login Card */}
                <div className="w-full bg-[#161c24] border border-[#2e4057] p-8 md:p-10 rounded-xl shadow-[0_0_40px_rgba(59,130,246,0.08)] relative before:absolute before:inset-0 before:rounded-xl before:border before:border-blue-500/30 before:pointer-events-none">
                    
                    <h2 className="text-[22px] font-medium text-slate-100 text-center mb-8 tracking-wide">Secure Login</h2>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="relative group">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                            <Input
                                id="email"
                                type="email"
                                placeholder="Email Address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="pl-10 h-12 bg-[#0a0f16] border-[#2a3649] text-slate-200 placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 transition-all rounded-md"
                                disabled={isLoading}
                            />
                        </div>

                        <div className="relative group">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                            <Input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="pl-10 pr-10 h-12 bg-[#0a0f16] border-[#2a3649] text-slate-200 placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 transition-all rounded-md"
                                disabled={isLoading}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none"
                            >
                                {showPassword ? <Eye className="w-[18px] h-[18px]" /> : <EyeOff className="w-[18px] h-[18px]" />}
                            </button>
                        </div>

                        <div className="flex items-center justify-between pt-1 pb-3">
                            <Link href="#" className="text-[13px] text-[#3b82f6] hover:text-[#60a5fa] font-medium transition-colors">
                                Forgot Password?
                            </Link>
                            
                            <div className="flex items-center space-x-2">
                                <div className="relative flex items-center">
                                    <input
                                        type="checkbox"
                                        id="rememberMe"
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        className="peer w-4 h-4 rounded border-[#3a4b63] text-blue-500 focus:ring-blue-500/30 bg-[#0a0f16] transition-all cursor-pointer"
                                        disabled={isLoading}
                                    />
                                </div>
                                <Label htmlFor="rememberMe" className="text-[13px] text-slate-300 cursor-pointer select-none">
                                    Remember Me
                                </Label>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-11 text-[15px] font-medium bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-md shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all border border-blue-400/20"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Logging in...
                                </>
                            ) : (
                                'Login'
                            )}
                        </Button>

                        <div className="text-center pt-3">
                            <span className="text-[13px] text-slate-400">Don't have an account? </span>
                            <Link href="#" className="text-[13px] text-[#3b82f6] hover:text-[#60a5fa] font-medium transition-colors">
                                Request access
                            </Link>
                        </div>
                    </form>
                </div>
            </div>

            {/* Footer */}
            <div className="w-full text-center pb-8 z-10 opacity-70">
                <div className="flex items-center justify-center mb-2">
                    <img src="/logo.png" alt="Logo" className="w-[18px] h-[18px] object-contain mr-1.5 filter brightness-0 invert" onError={(e) => e.currentTarget.style.display = 'none'} />
                    <span className="text-[13px] font-bold text-white tracking-tight">BMA</span>
                    <span className="text-[13px] font-medium text-slate-300 ml-1">CRM</span>
                </div>
                <p className="text-[11px] text-slate-500">© 2024 BMA Enterprise Solutions Inc. All rights reserved.</p>
            </div>
        </div>
    )
}
