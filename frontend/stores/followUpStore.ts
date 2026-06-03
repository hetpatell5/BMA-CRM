import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface FollowUp {
    id: string;
    name: string;
    date: string;
    number: string;
    description: string;
    followupDate: string; // the deadline
    requirement: string;
    createdAt: string;
}

interface FollowUpState {
    followUps: FollowUp[];
    addFollowUp: (followUp: Omit<FollowUp, 'id' | 'createdAt'>) => void;
    removeFollowUp: (id: string) => void;
}

export const useFollowUpStore = create<FollowUpState>()(
    persist(
        (set) => ({
            followUps: [],
            addFollowUp: (followUp) => set((state) => ({
                followUps: [
                    ...state.followUps,
                    {
                        ...followUp,
                        id: crypto.randomUUID(),
                        createdAt: new Date().toISOString()
                    }
                ]
            })),
            removeFollowUp: (id) => set((state) => ({
                followUps: state.followUps.filter((f) => f.id !== id)
            }))
        }),
        {
            name: 'follow-up-storage',
        }
    )
)
