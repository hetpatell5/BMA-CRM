'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Lock, Loader2, User, EyeOff, Eye } from 'lucide-react'
import { Label } from '@/components/ui/label'
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
        <div className={`min-h-screen flex items-center justify-center bg-[#f1f5f9] p-4 sm:p-8 ${supportFont.className}`}>
            
            {/* The Main Container */}
            <div className="w-full max-w-[1200px] min-h-[700px] bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] flex flex-col lg:flex-row relative">
                
                {/* Left Column: Login Section */}
                <div className="w-full lg:w-1/2 flex flex-col relative justify-center p-6 sm:p-12 md:p-16 lg:px-20 bg-white rounded-l-3xl z-10">
                    
                    <div className="w-full max-w-[440px] mx-auto animate-fade-in-up">
                        
                        {/* Header Logo */}
                        <div className="flex items-center justify-center mb-10">
                            <img 
                                src="/logo.png" 
                                alt="BMA CRM Logo" 
                                className="h-[64px] w-auto object-contain mr-4"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                            <div className="flex items-center whitespace-nowrap mt-1">
                                <span className="text-[34px] font-bold text-slate-900 tracking-tight leading-none">BMA</span>
                                <span className="text-[34px] font-light text-slate-500 leading-none ml-1.5">CRM</span>
                            </div>
                        </div>

                        {/* Login Card */}
                        <div className="w-full bg-white border border-slate-200 p-8 md:p-10 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative before:absolute before:inset-0 before:rounded-xl before:border before:border-slate-300/50 before:pointer-events-none">
                            
                            {/* Sign In Header */}
                            <div className="mb-8">
                                <h1 className="text-[32px] font-semibold text-slate-900 tracking-tight mb-1.5 leading-none">Sign in</h1>
                                <p className="text-[17px] text-slate-600">to access CRM</p>
                            </div>
                            
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="relative group">
                                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="Email Address"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="pl-10 h-12 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 transition-all rounded-md"
                                        disabled={isLoading}
                                    />
                                </div>

                                <div className="relative group">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                                    <Input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pl-10 pr-10 h-12 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 transition-all rounded-md"
                                        disabled={isLoading}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
                                    >
                                        {showPassword ? <Eye className="w-[18px] h-[18px]" /> : <EyeOff className="w-[18px] h-[18px]" />}
                                    </button>
                                </div>

                                <div className="flex items-center justify-end pt-1 pb-3">
                                    <div className="flex items-center space-x-2">
                                        <div className="relative flex items-center">
                                            <input
                                                type="checkbox"
                                                id="rememberMe"
                                                checked={rememberMe}
                                                onChange={(e) => setRememberMe(e.target.checked)}
                                                className="peer w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 bg-white transition-all cursor-pointer"
                                                disabled={isLoading}
                                            />
                                        </div>
                                        <Label htmlFor="rememberMe" className="text-[13px] text-slate-600 cursor-pointer select-none">
                                            Remember Me
                                        </Label>
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full h-11 text-[15px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-[0_4px_14px_rgba(37,99,235,0.2)] transition-all border border-blue-600"
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
                            </form>
                        </div>

                    </div>

                    {/* Footer */}
                    <div className="absolute bottom-8 left-0 right-0 w-full text-center px-6">
                        <p className="text-[13px] font-medium text-slate-400">© 2026 BMAP Eduservices pvt ltd. All rights reserved.</p>
                    </div>

                </div>

                {/* Right Column: 3D Illustration & Presentation */}
                <div className="hidden lg:flex w-full lg:w-1/2 flex-col relative items-center justify-center bg-[#f8fafc] border-l border-slate-100 rounded-r-3xl overflow-hidden">
                    
                    {/* Dot Grid Pattern */}
                    <div 
                        className="absolute inset-0 opacity-[0.4] pointer-events-none" 
                        style={{ backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)', backgroundSize: '32px 32px' }}
                    />

                    {/* 3D Illustration (Contained & Blended) */}
                    <div className="relative z-10 w-[120%] max-w-[800px] mt-[10%] animate-fade-in pointer-events-none transition-transform duration-[2000ms] hover:scale-[1.02]">
                        <img 
                            src="/illustration.png" 
                            alt="BMA CRM Student Management Illustration" 
                            className="w-full h-auto mix-blend-darken contrast-[1.05]"
                        />
                    </div>
                </div>
                
            </div>
        </div>
    )
}
