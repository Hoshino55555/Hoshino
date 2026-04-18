import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAsset } from '../../config/AssetRegistry';

export interface GameStats {
    mood: number;
    hunger: number;
    energy: number;
    totalFeedings: number;
    totalPlays: number;
    totalSleeps: number;
    lastPlayed: number;
    level: number;
    experience: number;
}

export interface AchievementProgress {
    id: string;
    name: string;
    progress: number;
    target: number;
    completed: boolean;
    dateCompleted?: number;
}

export class LocalGameEngine {
    private walletAddress: string;
    private achievementQueue: string[] = [];
    private completedAchievements: Set<string> = new Set();

    constructor(walletAddress: string) {
        this.walletAddress = walletAddress;
    }

    async init(): Promise<void> {
        await this.loadAchievementQueue();
        await this.loadCompletedAchievements();
    }

    async feedMoonoko(): Promise<GameStats> {
        const stats = await this.getLocalStats();

        stats.mood = Math.min(stats.mood + 1, 5);
        stats.hunger = Math.min(stats.hunger + 2, 5);
        stats.totalFeedings += 1;
        stats.experience += 10;
        stats.lastPlayed = Date.now();

        if (stats.experience >= stats.level * 100) {
            stats.level += 1;
            stats.experience = stats.experience - (stats.level - 1) * 100;
        }

        await this.saveLocalStats(stats);
        await this.checkFeedingAchievements(stats);

        console.log(`🍎 Fed moonoko! Mood: ${stats.mood}, Hunger: ${stats.hunger}, Total feeds: ${stats.totalFeedings}`);
        return stats;
    }

    async playWithMoonoko(): Promise<GameStats> {
        const stats = await this.getLocalStats();

        stats.mood = Math.min(stats.mood + 2, 5);
        stats.energy = Math.max(stats.energy - 1, 0);
        stats.totalPlays += 1;
        stats.experience += 15;
        stats.lastPlayed = Date.now();

        if (stats.experience >= stats.level * 100) {
            stats.level += 1;
            stats.experience = stats.experience - (stats.level - 1) * 100;
        }

        await this.saveLocalStats(stats);
        await this.checkPlayingAchievements(stats);

        console.log(`🎮 Played with moonoko! Mood: ${stats.mood}, Energy: ${stats.energy}, Total plays: ${stats.totalPlays}`);
        return stats;
    }

    async putMoonokoToSleep(): Promise<GameStats> {
        const stats = await this.getLocalStats();

        stats.energy = 5;
        stats.mood = Math.min(stats.mood + 1, 5);
        stats.totalSleeps += 1;
        stats.experience += 5;
        stats.lastPlayed = Date.now();

        await this.saveLocalStats(stats);
        await this.checkSleepingAchievements(stats);

        console.log(`😴 Moonoko went to sleep! Energy restored, Total sleeps: ${stats.totalSleeps}`);
        return stats;
    }

    private async checkFeedingAchievements(stats: GameStats): Promise<void> {
        if (stats.totalFeedings === 1 && !this.isAchievementCompleted('first_feed')) {
            await this.queueAchievement('first_feed');
        }

        if (stats.totalFeedings === 10 && !this.isAchievementCompleted('caretaker_10')) {
            await this.queueAchievement('caretaker_10');
        }

        if (stats.totalFeedings === 50 && !this.isAchievementCompleted('caretaker_50')) {
            await this.queueAchievement('caretaker_50');
        }
    }

    private async checkPlayingAchievements(stats: GameStats): Promise<void> {
        if (stats.totalPlays === 25 && !this.isAchievementCompleted('playful_friend')) {
            await this.queueAchievement('playful_friend');
        }
    }

    private async checkSleepingAchievements(stats: GameStats): Promise<void> {
        if (stats.totalSleeps === 20 && !this.isAchievementCompleted('night_owl')) {
            await this.queueAchievement('night_owl');
        }
    }

    private async queueAchievement(assetId: string): Promise<void> {
        const asset = getAsset(assetId);
        if (!asset || asset.category !== 'achievement') {
            console.warn(`⚠️ Achievement ${assetId} not found in registry`);
            return;
        }

        if (!this.achievementQueue.includes(assetId)) {
            this.achievementQueue.push(assetId);
            await this.saveAchievementQueue();
            console.log(`🏆 Achievement unlocked: ${asset.name} (queued for minting)`);
        }
    }

    private isAchievementCompleted(achievementId: string): boolean {
        return this.completedAchievements.has(achievementId);
    }

    async markAchievementMinted(achievementId: string): Promise<void> {
        this.completedAchievements.add(achievementId);
        this.achievementQueue = this.achievementQueue.filter(id => id !== achievementId);
        await this.saveAchievementQueue();
        await this.saveCompletedAchievements();
        console.log(`✅ Achievement ${achievementId} marked as minted`);
    }

    async getLocalStats(): Promise<GameStats> {
        let stored;
        try {
            stored = await AsyncStorage.getItem(`game_stats_${this.walletAddress}`);
        } catch (error) {
            console.warn('⚠️ Failed to get game stats, resetting...');
        }

        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (error) {
                console.warn('⚠️ Corrupted game stats, resetting...');
            }
        }

        return {
            mood: 3,
            hunger: 3,
            energy: 3,
            totalFeedings: 0,
            totalPlays: 0,
            totalSleeps: 0,
            lastPlayed: Date.now(),
            level: 1,
            experience: 0
        };
    }

    private async saveLocalStats(stats: GameStats): Promise<void> {
        try {
            await AsyncStorage.setItem(`game_stats_${this.walletAddress}`, JSON.stringify(stats));
        } catch (error) {
            console.error('❌ Failed to save game stats:', error);
        }
    }

    async updateStats(stats: GameStats): Promise<void> {
        await this.saveLocalStats(stats);
    }

    getQueuedAchievements(): string[] {
        return [...this.achievementQueue];
    }

    async clearAchievementQueue(): Promise<void> {
        this.achievementQueue = [];
        await this.saveAchievementQueue();
    }

    private async saveAchievementQueue(): Promise<void> {
        try {
            await AsyncStorage.setItem(`achievement_queue_${this.walletAddress}`, JSON.stringify(this.achievementQueue));
        } catch (error) {
            console.error('❌ Failed to save achievement queue:', error);
        }
    }

    private async loadAchievementQueue(): Promise<void> {
        let stored;
        try {
            stored = await AsyncStorage.getItem(`achievement_queue_${this.walletAddress}`);
        } catch (error) {
            console.warn('⚠️ Failed to load achievement queue, starting fresh');
            this.achievementQueue = [];
            return;
        }

        if (stored) {
            try {
                this.achievementQueue = JSON.parse(stored);
            } catch (error) {
                console.warn('⚠️ Corrupted achievement queue, starting fresh');
                this.achievementQueue = [];
            }
        }
    }

    private async saveCompletedAchievements(): Promise<void> {
        try {
            await AsyncStorage.setItem(`completed_achievements_${this.walletAddress}`, JSON.stringify([...this.completedAchievements]));
        } catch (error) {
            console.error('❌ Failed to save completed achievements:', error);
        }
    }

    private async loadCompletedAchievements(): Promise<void> {
        let stored;
        try {
            stored = await AsyncStorage.getItem(`completed_achievements_${this.walletAddress}`);
        } catch (error) {
            console.warn('⚠️ Failed to load completed achievements, starting fresh');
            this.completedAchievements = new Set();
            return;
        }

        if (stored) {
            try {
                this.completedAchievements = new Set(JSON.parse(stored));
            } catch (error) {
                console.warn('⚠️ Corrupted completed achievements, starting fresh');
                this.completedAchievements = new Set();
            }
        }
    }

    async getAchievementProgress(): Promise<AchievementProgress[]> {
        const stats = await this.getLocalStats();

        return [
            {
                id: 'first_feed',
                name: 'First Meal',
                progress: Math.min(stats.totalFeedings, 1),
                target: 1,
                completed: this.isAchievementCompleted('first_feed')
            },
            {
                id: 'caretaker_10',
                name: 'Caring Soul',
                progress: Math.min(stats.totalFeedings, 10),
                target: 10,
                completed: this.isAchievementCompleted('caretaker_10')
            },
            {
                id: 'caretaker_50',
                name: 'Dedicated Caretaker',
                progress: Math.min(stats.totalFeedings, 50),
                target: 50,
                completed: this.isAchievementCompleted('caretaker_50')
            },
            {
                id: 'playful_friend',
                name: 'Playful Friend',
                progress: Math.min(stats.totalPlays, 25),
                target: 25,
                completed: this.isAchievementCompleted('playful_friend')
            },
            {
                id: 'night_owl',
                name: 'Night Owl',
                progress: Math.min(stats.totalSleeps, 20),
                target: 20,
                completed: this.isAchievementCompleted('night_owl')
            }
        ];
    }
}