import { PublicKey } from '@solana/web3.js';
import { GlobalPointSystem, PointsReward } from './GlobalPointSystem';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DailyStats {
    date: string // YYYY-MM-DD format
    mood: number
    hunger: number
    energy: number
    feedCompleted: boolean // Hit 5 stars today
    sleepCompleted: boolean // Hit 5 stars today (8.5+ hours)
    chatCompleted: boolean // Chatted today
    moodBonusEarned: boolean // Earned the daily mood bonus
    sleepStartTime?: string // When sleep was initiated
    sleepDuration?: number // Hours slept
    feedActions: number // Number of feed actions today
    sleepActions: number // Number of sleep actions today
    chatActions: number // Number of chat actions today
}

export interface MoonCycle {
    id: string
    characterMint: string
    startDate: string // YYYY-MM-DD
    endDate: string // YYYY-MM-DD
    currentDay: number // 1-28
    dailyStats: DailyStats[]
    moodStreakDays: number // Days with 5-star mood
    isCompleted: boolean
    finalReward?: CycleReward
}

export interface CycleReward {
    success: boolean // Achieved 24+ days of 5-star mood
    moodDaysAchieved: number
    rewardType: 'basic' | 'good' | 'perfect'
    rewards: string[]
    nftBonus?: string
}

export interface IngredientDiscovery {
    id: string
    name: string
    rarity: 'common' | 'rare' | 'epic' | 'legendary'
    moodBonus: number
    description: string
    characterSpecific?: string // For Lyra's anime-themed ingredients
}

export class MoonCycleService {
    private storageKey: string
    private globalPointSystem: GlobalPointSystem | null = null

    constructor(characterMint: string, walletAddress?: string) {
        this.storageKey = `moon_cycle_${characterMint}`
        if (walletAddress) {
            this.globalPointSystem = new GlobalPointSystem(walletAddress)
        }
    }

    // Set wallet address for point tracking
    setWalletAddress(walletAddress: string): void {
        this.globalPointSystem = new GlobalPointSystem(walletAddress)
    }

    // Initialize a new moon cycle
    async createNewCycle(characterMint: string): Promise<MoonCycle> {
        const startDate = new Date().toISOString().split('T')[0]
        const endDate = this.addDays(new Date(), 28).toISOString().split('T')[0]

        const cycle: MoonCycle = {
            id: `cycle_${Date.now()}`,
            characterMint,
            startDate,
            endDate,
            currentDay: 1,
            dailyStats: [],
            moodStreakDays: 0,
            isCompleted: false
        }

        await this.saveCycle(cycle)
        console.log('🌙 New moon cycle started:', cycle)
        return cycle
    }

    // Get current active cycle or create new one
    async getCurrentCycle(characterMint: string): Promise<MoonCycle> {
        const cycle = await this.loadCycle()

        if (!cycle || cycle.isCompleted || this.isCycleExpired(cycle)) {
            return await this.createNewCycle(characterMint)
        }

        // Update current day
        cycle.currentDay = this.calculateCurrentDay(cycle.startDate)
        await this.saveCycle(cycle)

        return cycle
    }

    // Record daily stats and check for mood bonus eligibility
    async recordDailyStats(mood: number, hunger: number, energy: number, actionType: 'feed' | 'sleep' | 'chat', sleepDuration?: number, characterName?: string): Promise<{
        success: boolean
        moodBonusEarned: boolean
        message: string
        pointsReward?: PointsReward
    }> {
        const cycle = await this.loadCycle()
        if (!cycle || cycle.isCompleted) {
            return { success: false, moodBonusEarned: false, message: 'No active cycle' }
        }

        const today = new Date().toISOString().split('T')[0]
        let todayStats = cycle.dailyStats.find(s => s.date === today)

        if (!todayStats) {
            todayStats = {
                date: today,
                mood,
                hunger,
                energy,
                feedCompleted: false,
                sleepCompleted: false,
                chatCompleted: false,
                moodBonusEarned: false,
                feedActions: 0,
                sleepActions: 0,
                chatActions: 0
            }
            cycle.dailyStats.push(todayStats)
        }

        // Update stats
        todayStats.mood = Math.max(todayStats.mood, mood)
        todayStats.hunger = Math.max(todayStats.hunger, hunger)
        todayStats.energy = Math.max(todayStats.energy, energy)

        // Increment action counters
        if (actionType === 'feed') {
            todayStats.feedActions++
        } else if (actionType === 'sleep') {
            todayStats.sleepActions++
            if (sleepDuration) {
                todayStats.sleepDuration = sleepDuration
                todayStats.sleepStartTime = new Date().toISOString()
            }
        } else if (actionType === 'chat') {
            todayStats.chatActions++
        }

        // Check action completion
        if (actionType === 'feed' && hunger >= 5) {
            todayStats.feedCompleted = true
        }
        if (actionType === 'sleep' && energy >= 5 && (sleepDuration || 0) >= 8.5) {
            todayStats.sleepCompleted = true
        }
        if (actionType === 'chat') {
            todayStats.chatCompleted = true
        }

        // Check for mood bonus eligibility (max 1 per day)
        let moodBonusEarned = false
        if (!todayStats.moodBonusEarned) {
            if (actionType === 'feed' && todayStats.feedCompleted) {
                todayStats.moodBonusEarned = true
                moodBonusEarned = true
            } else if (actionType === 'sleep' && todayStats.sleepCompleted) {
                todayStats.moodBonusEarned = true
                moodBonusEarned = true
            } else if (actionType === 'chat' && todayStats.chatCompleted) {
                todayStats.moodBonusEarned = true
                moodBonusEarned = true
            }
        }

        // Update mood streak
        if (todayStats.mood >= 5) {
            const existingMoodDay = cycle.dailyStats.filter(s => s.mood >= 5).find(s => s.date === today)
            if (!existingMoodDay || existingMoodDay.date === today) {
                cycle.moodStreakDays = cycle.dailyStats.filter(s => s.mood >= 5).length
            }
        }

        await this.saveCycle(cycle)

        // Award global points if point system is available
        let pointsReward: PointsReward | undefined
        if (this.globalPointSystem && characterName) {
            const characterMint = cycle.characterMint
            const achievedGoal = (actionType === 'feed' && todayStats.feedCompleted) ||
                (actionType === 'sleep' && todayStats.sleepCompleted) ||
                (actionType === 'chat' && todayStats.chatCompleted)

            pointsReward = await this.globalPointSystem.awardInteractionPoints(
                characterMint,
                characterName,
                actionType,
                achievedGoal
            )
        }

        const message = moodBonusEarned
            ? `✨ Mood bonus earned! ${actionType} completed with 5 stars!`
            : todayStats.moodBonusEarned
                ? `💫 Already earned today's mood bonus!`
                : `🌟 ${actionType} completed! Reach 5 stars to earn mood bonus.`

        return { success: true, moodBonusEarned, message, pointsReward }
    }

    // Generate Lyra-specific ingredient discoveries
    generateIngredientDiscovery(): IngredientDiscovery | null {
        // Random chance throughout the day
        if (Math.random() < 0.3) { // 30% chance
            const animeIngredients = [
                {
                    id: 'ramen_packet',
                    name: 'Instant Ramen Packet',
                    rarity: 'common' as const,
                    moodBonus: 1,
                    description: 'A classic anime staple! Perfect for late-night study sessions.',
                    characterSpecific: 'Lyra squeals: "OMG this is like in every slice-of-life anime!"'
                },
                {
                    id: 'bento_box',
                    name: 'Homemade Bento Box',
                    rarity: 'rare' as const,
                    moodBonus: 2,
                    description: 'Carefully prepared with love, just like in romance anime.',
                    characterSpecific: 'Lyra blushes: "This is so romantic! Like when the love interest makes lunch!"'
                },
                {
                    id: 'magical_mochi',
                    name: 'Magical Girl Mochi',
                    rarity: 'epic' as const,
                    moodBonus: 3,
                    description: 'Sparkles with magical energy, straight from a magical girl anime.',
                    characterSpecific: 'Lyra transforms: "In the name of the moon, I will eat this mochi!"'
                },
                {
                    id: 'legendary_takoyaki',
                    name: 'Legendary Takoyaki',
                    rarity: 'legendary' as const,
                    moodBonus: 5,
                    description: 'The ultimate takoyaki that appears once in a lifetime, like in shonen anime.',
                    characterSpecific: 'Lyra cries anime tears: "This is my power-up moment! My protagonist arc!"'
                }
            ]

            return animeIngredients[Math.floor(Math.random() * animeIngredients.length)]
        }

        return null
    }

    // Start sleep session
    async startSleep(): Promise<{ success: boolean; message: string }> {
        const cycle = await this.loadCycle()
        if (!cycle || cycle.isCompleted) {
            return { success: false, message: 'No active cycle' }
        }

        const today = new Date().toISOString().split('T')[0]
        let todayStats = cycle.dailyStats.find(s => s.date === today)

        if (!todayStats) {
            todayStats = {
                date: today,
                mood: 3,
                hunger: 3,
                energy: 3,
                feedCompleted: false,
                sleepCompleted: false,
                chatCompleted: false,
                moodBonusEarned: false,
                feedActions: 0,
                sleepActions: 0,
                chatActions: 0
            }
            cycle.dailyStats.push(todayStats)
        }

        if (todayStats.sleepStartTime) {
            return { success: false, message: 'Already sleeping! Wake up first.' }
        }

        todayStats.sleepStartTime = new Date().toISOString()
        await this.saveCycle(cycle)

        return {
            success: true,
            message: '😴 Sleep started! Make sure to rest for at least 8.5 hours to get 5 stars!'
        }
    }

    // End sleep session and calculate energy
    async endSleep(): Promise<{ success: boolean; energyGained: number; stars: number; message: string }> {
        const cycle = await this.loadCycle()
        if (!cycle || cycle.isCompleted) {
            return { success: false, energyGained: 0, stars: 0, message: 'No active cycle' }
        }

        const today = new Date().toISOString().split('T')[0]
        const todayStats = cycle.dailyStats.find(s => s.date === today)

        if (!todayStats || !todayStats.sleepStartTime) {
            return { success: false, energyGained: 0, stars: 0, message: 'Not currently sleeping!' }
        }

        const sleepStart = new Date(todayStats.sleepStartTime)
        const sleepEnd = new Date()
        const sleepDuration = (sleepEnd.getTime() - sleepStart.getTime()) / (1000 * 60 * 60) // hours

        // Calculate energy and stars based on sleep duration
        let energyGained = 0
        let stars = 0

        if (sleepDuration >= 8.5) {
            energyGained = 5
            stars = 5
            todayStats.sleepCompleted = true
        } else if (sleepDuration >= 7) {
            energyGained = 4
            stars = 4
        } else if (sleepDuration >= 5) {
            energyGained = 3
            stars = 3
        } else if (sleepDuration >= 3) {
            energyGained = 2
            stars = 2
        } else {
            energyGained = 1
            stars = 1
        }

        todayStats.energy = Math.max(todayStats.energy, energyGained)
        todayStats.sleepDuration = sleepDuration
        todayStats.sleepStartTime = undefined // Clear sleep start
        todayStats.sleepActions++

        await this.saveCycle(cycle)

        const message = sleepDuration >= 8.5
            ? `🌟 Perfect sleep! ${sleepDuration.toFixed(1)} hours = 5 stars! Energy fully restored!`
            : `😴 Slept for ${sleepDuration.toFixed(1)} hours = ${stars} stars. Need 8.5+ hours for 5 stars!`

        return { success: true, energyGained, stars, message }
    }

    // Calculate food stars from dishes made with ingredients
    calculateFoodStars(ingredients: IngredientDiscovery[]): number {
        if (ingredients.length === 0) return 1

        const totalMoodBonus = ingredients.reduce((sum, ing) => sum + ing.moodBonus, 0)

        // Convert mood bonus to food stars (roughly)
        if (totalMoodBonus >= 10) return 5 // Legendary feast
        if (totalMoodBonus >= 7) return 4  // Epic meal
        if (totalMoodBonus >= 4) return 3  // Good dish
        if (totalMoodBonus >= 2) return 2  // Decent food
        return 1 // Basic food
    }

    // Check cycle completion and calculate rewards
    async checkCycleCompletion(): Promise<CycleReward | null> {
        const cycle = await this.loadCycle()
        if (!cycle || cycle.currentDay < 28) return null

        const moodDaysAchieved = cycle.moodStreakDays
        const success = moodDaysAchieved >= 24

        let rewardType: 'basic' | 'good' | 'perfect'
        let rewards: string[]

        if (moodDaysAchieved >= 28) {
            rewardType = 'perfect'
            rewards = ['Perfect Cycle Achievement NFT', '1000 Mood Points', 'Legendary Ingredient Pack', 'Anime Collection Bonus']
        } else if (moodDaysAchieved >= 24) {
            rewardType = 'good'
            rewards = ['Cycle Completion Achievement NFT', '500 Mood Points', 'Epic Ingredient Pack']
        } else {
            rewardType = 'basic'
            rewards = ['Participation Achievement', '100 Mood Points', 'Basic Ingredient Pack']
        }

        const reward: CycleReward = {
            success,
            moodDaysAchieved,
            rewardType,
            rewards,
            nftBonus: success ? 'Moonlight Guardian Badge' : undefined
        }

        // Mark cycle as completed
        cycle.isCompleted = true
        cycle.finalReward = reward
        await this.saveCycle(cycle)

        console.log('🌙 Cycle completed!', reward)
        return reward
    }

    // Get current sleep status
    async getSleepStatus(): Promise<{
        isSleeping: boolean
        sleepStartTime?: string
        sleepDuration?: number
        message: string
    }> {
        const cycle = await this.loadCycle()
        if (!cycle) {
            return { isSleeping: false, message: 'No active cycle' }
        }

        const today = new Date().toISOString().split('T')[0]
        const todayStats = cycle.dailyStats.find(s => s.date === today)

        if (todayStats?.sleepStartTime) {
            const sleepStart = new Date(todayStats.sleepStartTime)
            const now = new Date()
            const duration = (now.getTime() - sleepStart.getTime()) / (1000 * 60 * 60)

            return {
                isSleeping: true,
                sleepStartTime: todayStats.sleepStartTime,
                sleepDuration: duration,
                message: `Sleeping for ${duration.toFixed(1)} hours. Need 8.5+ for 5 stars!`
            }
        }

        return { isSleeping: false, message: 'Ready to sleep' }
    }

    // Get cycle progress info
    async getCycleProgress(): Promise<{
        currentDay: number
        daysRemaining: number
        moodDaysAchieved: number
        moodDaysNeeded: number
        onTrack: boolean
        todayCompleted: {
            feed: boolean
            sleep: boolean
            chat: boolean
            moodBonus: boolean
        }
    }> {
        const cycle = await this.loadCycle()
        if (!cycle) {
            return {
                currentDay: 0,
                daysRemaining: 28,
                moodDaysAchieved: 0,
                moodDaysNeeded: 24,
                onTrack: true,
                todayCompleted: { feed: false, sleep: false, chat: false, moodBonus: false }
            }
        }

        const today = new Date().toISOString().split('T')[0]
        const todayStats = cycle.dailyStats.find(s => s.date === today)

        return {
            currentDay: cycle.currentDay,
            daysRemaining: 28 - cycle.currentDay,
            moodDaysAchieved: cycle.moodStreakDays,
            moodDaysNeeded: 24,
            onTrack: cycle.moodStreakDays >= (cycle.currentDay * 0.857), // 24/28 ratio
            todayCompleted: {
                feed: todayStats?.feedCompleted || false,
                sleep: todayStats?.sleepCompleted || false,
                chat: todayStats?.chatCompleted || false,
                moodBonus: todayStats?.moodBonusEarned || false
            }
        }
    }

    // Utility methods
    private addDays(date: Date, days: number): Date {
        const result = new Date(date)
        result.setDate(result.getDate() + days)
        return result
    }

    private calculateCurrentDay(startDate: string): number {
        const start = new Date(startDate)
        const today = new Date()
        const diffTime = Math.abs(today.getTime() - start.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        return Math.min(diffDays, 28)
    }

    private isCycleExpired(cycle: MoonCycle): boolean {
        const endDate = new Date(cycle.endDate)
        const today = new Date()
        return today > endDate
    }

    private async saveCycle(cycle: MoonCycle): Promise<void> {
        await AsyncStorage.setItem(this.storageKey, JSON.stringify(cycle))
    }

    private async loadCycle(): Promise<MoonCycle | null> {
        const stored = await AsyncStorage.getItem(this.storageKey)
        return stored ? JSON.parse(stored) : null
    }
}