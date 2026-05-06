'use client'

import { useRef, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import {
    Plus, Filter, Search, MoreVertical,
    Clock, Users, ChevronDown, LayoutGrid, List,
} from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/stores/authStore'

// Types
interface Task {
    id: string
    title: string
    description: string
    status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'COMPLETED'
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
    assignedTo: { id: number; fullName: string; avatar: string | null }
    assignedBy: { id: number; fullName: string } | null
    dueDate: string | null
    createdAt: string
}

const COLUMNS = [
    { id: 'TODO', title: 'To Do', dotColor: 'bg-slate-400', headerBg: 'bg-slate-500/10 border-slate-500/20' },
    { id: 'IN_PROGRESS', title: 'In Progress', dotColor: 'bg-blue-400', headerBg: 'bg-blue-500/10 border-blue-500/20' },
    { id: 'IN_REVIEW', title: 'In Review', dotColor: 'bg-purple-400', headerBg: 'bg-purple-500/10 border-purple-500/20' },
    { id: 'BLOCKED', title: 'Blocked', dotColor: 'bg-red-400', headerBg: 'bg-red-500/10 border-red-500/20' },
    { id: 'COMPLETED', title: 'Done', dotColor: 'bg-green-400', headerBg: 'bg-green-500/10 border-green-500/20' },
]

export default function TasksPage() {
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const { user: currentUser, _hasHydrated, isAuthenticated } = useAuthStore()
    const isAdmin = currentUser?.role === 'ADMIN'
    const router = require('next/navigation').useRouter()

    useEffect(() => {
        if (_hasHydrated && currentUser) {
            const isTelecaller = currentUser.role === 'STAFF' && currentUser.staffRole === 'TELECALLER'
            if (currentUser.role === 'STAFF' && !isTelecaller) {
                router.push('/dashboard')
            }
        }
    }, [currentUser, _hasHydrated, router])

    const [search, setSearch] = useState('')
    const [filterPriority, setFilterPriority] = useState<string>('all')
    const [filterMember, setFilterMember] = useState<string>('all')
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban')
    const kanbanScrollRef = useRef<HTMLDivElement | null>(null)

    // Fetch Tasks
    const { data: tasksData, isLoading } = useQuery({
        queryKey: ['tasks', filterPriority],
        queryFn: async () => {
            const params: any = {}
            if (filterPriority !== 'all') params.priority = filterPriority
            const res = await api.get('/tasks', { params })
            return res.data
        },
        enabled: _hasHydrated && isAuthenticated,
    })

    // Fetch team members for filter (admin/manager only)
    const { data: teamData } = useQuery({
        queryKey: ['assignable-users'],
        queryFn: async () => {
            const res = await api.get('/team/assignable')
            return res.data
        },
        enabled: _hasHydrated && isAuthenticated && (isAdmin || currentUser?.role === 'MANAGER'),
    })

    const allTasks: Task[] = tasksData?.data || []
    const teamMembers = teamData?.data || []

    // Apply client-side filters
    const tasks = allTasks.filter((t) => {
        if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
        if (filterMember !== 'all' && t.assignedTo?.id?.toString() !== filterMember) return false
        return true
    })

    // Move Task Mutation
    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string; status: string }) => {
            await api.put(`/tasks/${id}`, { status })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            toast({ title: 'Task moved successfully' })
        },
    })

    useEffect(() => {
        const handleDragOverGlobal = (e: DragEvent) => {
            const ghost = document.getElementById('custom-drag-ghost')
            if (ghost) {
                const offsetX = parseFloat(ghost.dataset.offsetX || '0')
                const offsetY = parseFloat(ghost.dataset.offsetY || '0')
                ghost.style.left = `${e.clientX - offsetX}px`
                ghost.style.top = `${e.clientY - offsetY}px`
            }
        }
        document.addEventListener('dragover', handleDragOverGlobal)
        return () => document.removeEventListener('dragover', handleDragOverGlobal)
    }, [])

    // Drag and Drop
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
        e.dataTransfer.setData('text/plain', id)

        const target = e.currentTarget
        const rect = target.getBoundingClientRect()

        // Hide default ghost completely by setting it to a transparent 1x1 image
        const emptyImage = new Image()
        emptyImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
        e.dataTransfer.setDragImage(emptyImage, 0, 0)

        // Remove existing custom ghost if any
        let ghost = document.getElementById('custom-drag-ghost')
        if (ghost) ghost.remove()

        // Create custom opaque ghost
        ghost = target.cloneNode(true) as HTMLElement
        ghost.id = 'custom-drag-ghost'

        // Apply solid coloring to mimic original styling but totally opaque
        ghost.classList.remove('glass', 'bg-white/5', 'hover:bg-white/10')
        ghost.style.backgroundColor = '#1e293b'
        ghost.style.borderColor = '#334155'
        ghost.style.borderWidth = '1px'
        ghost.style.borderStyle = 'solid'
        ghost.style.color = 'white'

        // Setup fixed positioning mapping precisely to cursor
        ghost.style.width = `${rect.width}px`
        ghost.style.height = `${rect.height}px`
        ghost.style.position = 'fixed'
        ghost.style.zIndex = '9999'
        ghost.style.pointerEvents = 'none' // Important: ghost must not block drop areas

        // Add subtle rotation and shadow to indicate it's lifted
        ghost.style.transform = 'rotate(3deg) scale(1.02)'
        ghost.style.boxShadow = '0 25px 50px -12px rgba(0,0,0,0.5)'
        ghost.style.transition = 'transform 0.1s ease'

        // Store click offsets to correctly position under cursor during drag
        const offsetX = e.clientX - rect.left
        const offsetY = e.clientY - rect.top
        ghost.dataset.offsetX = offsetX.toString()
        ghost.dataset.offsetY = offsetY.toString()

        // Set immediate position
        ghost.style.left = `${e.clientX - offsetX}px`
        ghost.style.top = `${e.clientY - offsetY}px`

        document.body.appendChild(ghost)

        // Visually fade the original slightly while dragging
        setTimeout(() => { target.style.opacity = '0.3' }, 0)
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
    }

    const handleDrop = (e: React.DragEvent, status: string) => {
        e.preventDefault()
        const id = e.dataTransfer.getData('text/plain')
        if (id) updateStatusMutation.mutate({ id, status })
    }

    const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
        const ghost = document.getElementById('custom-drag-ghost')
        if (ghost) ghost.remove()
        e.currentTarget.style.opacity = '1'
    }

    // Let mouse wheel scroll the board horizontally without affecting full page layout
    const handleKanbanWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        const el = kanbanScrollRef.current
        if (!el) return

        const target = e.target as HTMLElement
        const isInsideColumn = target.closest('.overflow-y-auto')

        if (isInsideColumn) {
            const column = target.closest('.overflow-y-auto') as HTMLElement
            const canScrollUp = column.scrollTop > 0
            const canScrollDown = Math.ceil(column.scrollTop + column.clientHeight) < column.scrollHeight

            if ((e.deltaY < 0 && canScrollUp) || (e.deltaY > 0 && canScrollDown)) {
                return // Let native vertical scroll happen
            }
        }

        if (e.deltaY !== 0 && !e.shiftKey) {
            if (el.scrollWidth > el.clientWidth) {
                el.scrollLeft += e.deltaY
                e.preventDefault()
            }
        }
    }

    const getPriorityColor = (p: string) => {
        switch (p) {
            case 'URGENT': return 'bg-red-500/20 text-red-300 border-red-500/30'
            case 'HIGH': return 'bg-orange-500/20 text-orange-300 border-orange-500/30'
            case 'MEDIUM': return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
            default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30'
        }
    }

    // Group tasks by member for admin "by member" view
    const memberTaskMap = new Map<number, { member: any; tasks: Task[] }>()
    if (isAdmin) {
        tasks.forEach((t) => {
            const memberId = t.assignedTo?.id
            if (!memberId) return
            if (!memberTaskMap.has(memberId)) {
                memberTaskMap.set(memberId, { member: t.assignedTo, tasks: [] })
            }
            memberTaskMap.get(memberId)!.tasks.push(t)
        })
    }

    return (
        <div className="space-y-5 h-[calc(100vh-8rem)] flex flex-col min-w-0 max-w-full overflow-hidden">
            {/* Header */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Task Board</h1>
                    <p className="text-muted-foreground">Manage and track team projects</p>
                </div>

                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-52">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search tasks..."
                            className="pl-8"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <Select value={filterPriority} onValueChange={setFilterPriority}>
                        <SelectTrigger className="w-[130px]">
                            <Filter className="w-4 h-4 mr-2" />
                            <SelectValue placeholder="Priority" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Priority</SelectItem>
                            <SelectItem value="URGENT">Urgent</SelectItem>
                            <SelectItem value="HIGH">High</SelectItem>
                            <SelectItem value="MEDIUM">Medium</SelectItem>
                            <SelectItem value="LOW">Low</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Member filter for Admin/Manager */}
                    {(isAdmin || currentUser?.role === 'MANAGER') && teamMembers.length > 0 && (
                        <Select value={filterMember} onValueChange={setFilterMember}>
                            <SelectTrigger className="w-[160px]">
                                <Users className="w-4 h-4 mr-2" />
                                <SelectValue placeholder="All Members" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Members</SelectItem>
                                {teamMembers.map((m: any) => (
                                    <SelectItem key={m.id} value={m.id.toString()}>
                                        {m.fullName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    <div className="flex items-center gap-1 bg-white/5 border border-white/10 p-1 rounded-md">
                        <Button
                            variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => setViewMode('kanban')}
                        >
                            <LayoutGrid className="w-4 h-4 mr-1.5" />
                            Kanban
                        </Button>
                        <Button
                            variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => setViewMode('table')}
                        >
                            <List className="w-4 h-4 mr-1.5" />
                            Table
                        </Button>
                    </div>

                    <Button onClick={() => setShowCreateDialog(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        New Task
                    </Button>
                </div>
            </div>

            {/* Member Summary Row — admin only, when viewing all members */}
            {isAdmin && filterMember === 'all' && memberTaskMap.size > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-1">
                    {Array.from(memberTaskMap.values()).map(({ member, tasks: mTasks }) => (
                        <button
                            key={member.id}
                            onClick={() => setFilterMember(member.id.toString())}
                            className="glass rounded-xl px-4 py-2.5 flex items-center gap-3 shrink-0 hover:bg-white/10 transition-colors"
                        >
                            <Avatar className="h-7 w-7">
                                <AvatarImage src={member.avatar || undefined} />
                                <AvatarFallback className="text-xs">{member.fullName?.substring(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div className="text-left">
                                <p className="text-xs font-medium">{member.fullName?.split(' ')[0]}</p>
                                <p className="text-[10px] text-muted-foreground">{mTasks.length} task{mTasks.length !== 1 ? 's' : ''}</p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Active member filter chip */}
            {filterMember !== 'all' && (
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Showing tasks for:</span>
                    <Badge variant="secondary" className="gap-1.5 py-1 px-3">
                        {teamMembers.find((m: any) => m.id.toString() === filterMember)?.fullName || 'Member'}
                        <button
                            onClick={() => setFilterMember('all')}
                            className="ml-1 hover:text-white text-muted-foreground"
                        >
                            ✕
                        </button>
                    </Badge>
                </div>
            )}

            {/* Create Task Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Create New Task</DialogTitle>
                    </DialogHeader>
                    {showCreateDialog && <CreateTaskForm onSuccess={() => setShowCreateDialog(false)} />}
                </DialogContent>
            </Dialog>

            {/* Kanban Board */}
            {viewMode === 'kanban' && (
                <div className="flex-1 min-h-0 min-w-0 max-w-full overflow-hidden rounded-xl animate-fade-in transition-all">
                    <div
                        ref={kanbanScrollRef}
                        onWheel={handleKanbanWheel}
                        className="h-full w-full max-w-full overflow-x-auto overflow-y-hidden pb-4"
                    >
                        <div className="flex h-full w-max min-w-max gap-3 md:gap-4 pr-1">
                            {COLUMNS.map((col) => {
                                const colTasks = tasks.filter((t) => t.status === col.id)
                                return (
                                    <div
                                        key={col.id}
                                        className="flex flex-col w-64 md:w-72 lg:w-80 shrink-0 rounded-xl glass p-2 md:p-3 h-full"
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, col.id)}
                                    >
                                        {/* Column Header */}
                                        <div className={`flex items-center justify-between mb-3 px-2 py-1.5 rounded-lg border ${col.headerBg}`}>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2.5 h-2.5 rounded-full ${col.dotColor}`} />
                                                <h3 className="font-semibold text-xs uppercase tracking-wide">
                                                    {col.title}
                                                </h3>
                                            </div>
                                            <span className="text-xs font-medium text-muted-foreground">
                                                {colTasks.length}
                                            </span>
                                        </div>

                                        {/* Task Cards */}
                                        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
                                            {colTasks.map((task) => {
                                                const isCompleted = task.status === 'COMPLETED'
                                                return (
                                                    <div
                                                        key={task.id}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, task.id)}
                                                        onDragEnd={handleDragEnd}
                                                        className={`group glass rounded-lg p-3 border transition-all cursor-move active:cursor-grabbing ${isCompleted
                                                            ? 'border-green-500/40 bg-green-500/10 hover:bg-green-500/15'
                                                            : 'border-white/10 hover:border-white/20'
                                                            }`}
                                                    >
                                                        {/* Priority badge */}
                                                        <div className="flex justify-between items-start mb-2">
                                                            <Badge className={`text-[10px] px-1.5 py-0 border ${isCompleted ? 'bg-green-500/20 text-green-400 border-green-500/30' : getPriorityColor(task.priority)}`}>
                                                                {task.priority}
                                                            </Badge>
                                                        </div>

                                                        {/* Title */}
                                                        <h4 className={`font-medium text-sm mb-1 leading-snug ${isCompleted ? 'text-green-50' : 'text-foreground'}`}>
                                                            {task.title}
                                                        </h4>

                                                        {/* Description */}
                                                        {task.description && (
                                                            <p className={`text-xs line-clamp-2 mb-3 ${isCompleted ? 'text-green-200/60' : 'text-muted-foreground'}`}>
                                                                {task.description}
                                                            </p>
                                                        )}

                                                        {/* Footer: Assignee + Due Date */}
                                                        <div className={`flex items-center justify-between text-xs mt-2 ${isCompleted ? 'text-green-200/50' : 'text-muted-foreground'}`}>
                                                            <div className="flex items-center gap-1.5">
                                                                <Avatar className="h-5 w-5 border border-white/5">
                                                                    <AvatarImage src={task.assignedTo?.avatar || undefined} />
                                                                    <AvatarFallback className={`text-[9px] ${isCompleted ? 'bg-green-500/20 text-green-300' : ''}`}>
                                                                        {task.assignedTo?.fullName?.substring(0, 2)}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <span className="truncate max-w-[80px]">
                                                                    {task.assignedTo?.fullName?.split(' ')[0]}
                                                                </span>
                                                            </div>

                                                            {task.dueDate && (
                                                                <div
                                                                    className={`flex items-center gap-1 ${new Date(task.dueDate) < new Date() && !isCompleted
                                                                        ? 'text-red-400'
                                                                        : ''
                                                                        }`}
                                                                >
                                                                    <Clock className="w-3 h-3" />
                                                                    <span>{format(new Date(task.dueDate), 'MMM d')}</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Assigned By — show for admin/manager */}
                                                        {task.assignedBy && (isAdmin || currentUser?.role === 'MANAGER') && (
                                                            <div className={`mt-2 pt-2 border-t text-[11px] ${isCompleted ? 'border-green-500/20 text-green-200/40' : 'border-white/5 text-muted-foreground'}`}>
                                                                Assigned by <span className={isCompleted ? 'text-green-100/70' : 'text-foreground/70'}>{task.assignedBy.fullName}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}

                                            {/* Empty state */}
                                            {colTasks.length === 0 && (
                                                <div className="text-center py-8 text-xs text-muted-foreground/50">
                                                    No tasks
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Table View */}
            {viewMode === 'table' && (
                <div className="flex-1 overflow-hidden glass rounded-xl border border-white/10 animate-fade-in flex flex-col">
                    <div className="overflow-auto scrollbar-thin flex-1">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-muted-foreground bg-white/5 sticky top-0 z-10 backdrop-blur-md">
                                <tr>
                                    <th className="font-semibold p-4">Task Name</th>
                                    <th className="font-semibold p-4">Assignee</th>
                                    <th className="font-semibold p-4">Status</th>
                                    <th className="font-semibold p-4">Priority</th>
                                    <th className="font-semibold p-4">Due Date</th>
                                    {(isAdmin || currentUser?.role === 'MANAGER') && <th className="font-semibold p-4">Assigned By</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {tasks.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-12 text-muted-foreground">
                                            No tasks found matching your filters.
                                        </td>
                                    </tr>
                                ) : (
                                    tasks.map((task) => {
                                        const isCompleted = task.status === 'COMPLETED';
                                        return (
                                            <tr key={task.id} className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors group ${isCompleted ? 'opacity-60' : ''}`}>
                                                <td className="p-4 align-top">
                                                    <p className={`font-medium mb-1 ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{task.title}</p>
                                                    {task.description && (
                                                        <p className="text-xs text-muted-foreground line-clamp-1 max-w-[300px]" title={task.description}>
                                                            {task.description}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="p-4 align-top">
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="h-6 w-6">
                                                            <AvatarImage src={task.assignedTo?.avatar || undefined} />
                                                            <AvatarFallback className="text-[10px]">
                                                                {task.assignedTo?.fullName?.substring(0, 2)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span className="text-xs font-medium">
                                                            {task.assignedTo?.fullName}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-4 align-top">
                                                    <Select
                                                        value={task.status}
                                                        onValueChange={(val) => updateStatusMutation.mutate({ id: task.id, status: val })}
                                                    >
                                                        <SelectTrigger className="h-7 text-xs border-white/10 w-[130px] shadow-none bg-transparent hover:bg-white/5">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {COLUMNS.map(col => (
                                                                <SelectItem key={col.id} value={col.id} className="text-xs">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-2 h-2 rounded-full ${col.dotColor}`} />
                                                                        {col.title}
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </td>
                                                <td className="p-4 align-top">
                                                    <Badge className={`text-[10px] px-1.5 py-0 border ${getPriorityColor(task.priority)}`}>
                                                        {task.priority}
                                                    </Badge>
                                                </td>
                                                <td className="p-4 align-top">
                                                    {task.dueDate ? (
                                                        <div className={`flex items-center gap-1.5 text-xs ${new Date(task.dueDate) < new Date() && !isCompleted ? 'text-red-400 font-medium' : 'text-muted-foreground'}`}>
                                                            <Clock className="w-3.5 h-3.5" />
                                                            {format(new Date(task.dueDate), 'MMM d, yyyy')}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground/50">-</span>
                                                    )}
                                                </td>
                                                {(isAdmin || currentUser?.role === 'MANAGER') && (
                                                    <td className="p-4 align-top text-xs text-muted-foreground">
                                                        {task.assignedBy?.fullName || '-'}
                                                    </td>
                                                )}
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}

function CreateTaskForm({ onSuccess }: { onSuccess: () => void }) {
    const queryClient = useQueryClient()
    const { toast } = useToast()
    const { _hasHydrated, isAuthenticated } = useAuthStore()
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [priority, setPriority] = useState('MEDIUM')
    const [assignee, setAssignee] = useState('')
    const [dueDate, setDueDate] = useState('')

    // Fetch assignable team members
    const { data: teamData } = useQuery({
        queryKey: ['assignable-users'],
        queryFn: async () => {
            const res = await api.get('/team/assignable')
            return res.data
        },
        enabled: _hasHydrated && isAuthenticated,
    })

    const assignees = teamData?.data || []

    const createTask = useMutation({
        mutationFn: async () => {
            await api.post('/tasks', {
                title,
                description,
                priority,
                assignedToId: assignee,
                dueDate: dueDate ? new Date(dueDate).toISOString() : null,
                status: 'TODO',
            })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            toast({ title: 'Task created successfully' })
            onSuccess()
        },
        onError: (err: any) => {
            toast({
                title: 'Error creating task',
                description: err.response?.data?.message || 'Something went wrong',
                variant: 'destructive',
            })
        },
    })

    return (
        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <label className="text-sm font-medium">Task Title</label>
                <Input
                    placeholder="e.g. Update Homepage Design"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                    placeholder="Brief details about the task"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Priority</label>
                    <Select value={priority} onValueChange={setPriority}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="LOW">Low</SelectItem>
                            <SelectItem value="MEDIUM">Medium</SelectItem>
                            <SelectItem value="HIGH">High</SelectItem>
                            <SelectItem value="URGENT">Urgent</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Due Date</label>
                    <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">Assign To</label>
                <Select value={assignee} onValueChange={setAssignee}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select team member" />
                    </SelectTrigger>
                    <SelectContent>
                        {assignees.map((a: any) => (
                            <SelectItem key={a.id} value={a.id.toString()}>
                                {a.fullName}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="pt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={onSuccess}>Cancel</Button>
                <Button onClick={() => createTask.mutate()} disabled={createTask.isPending || !title || !assignee}>
                    {createTask.isPending ? 'Creating...' : 'Create Task'}
                </Button>
            </div>
        </div>
    )
}

