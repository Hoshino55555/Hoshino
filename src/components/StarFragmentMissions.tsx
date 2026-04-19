import React, { useState, useEffect } from 'react'
import { Connection, PublicKey } from '@solana/web3.js'
import StarFragmentService, { Mission, PlayerProgress } from '../services/StarFragmentService'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions, ActivityIndicator } from 'react-native'

interface StarFragmentMissionsProps {
    connection: Connection
    walletAddress?: string
    onClose: () => void
    onNotification: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void
}

const StarFragmentMissions: React.FC<StarFragmentMissionsProps> = ({
    connection,
    walletAddress,
    onClose,
    onNotification
}) => {
    const [starFragmentService] = useState(() => new StarFragmentService(connection))
    const [playerProgress, setPlayerProgress] = useState<PlayerProgress | null>(null)
    const [dailyMissions, setDailyMissions] = useState<Mission[]>([])
    const [weeklyMissions, setWeeklyMissions] = useState<Mission[]>([])
    const [seasonMissions, setSeasonMissions] = useState<Mission[]>([])
    const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'season' | 'progress'>('daily')
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        if (walletAddress) {
            loadPlayerData()
        }
    }, [walletAddress])

    const loadPlayerData = async () => {
        if (!walletAddress) return

        setIsLoading(true)
        try {
            const loginResult = await starFragmentService.checkDailyLogin(walletAddress)
            if (loginResult.isNewDay) {
                onNotification(
                    `Daily login bonus: ${loginResult.loginReward + loginResult.streakBonus} star fragments! 🌟`,
                    'success'
                )
            }

            const progress = await starFragmentService.getPlayerProgress(walletAddress)
            setPlayerProgress(progress)

            const [daily, weekly, season] = await Promise.all([
                starFragmentService.getDailyMissions(walletAddress),
                starFragmentService.getWeeklyMissions(walletAddress),
                starFragmentService.getSeasonMissions(walletAddress),
            ])

            setDailyMissions(daily)
            setWeeklyMissions(weekly)
            setSeasonMissions(season)
        } catch (error) {
            console.error('Error loading player data:', error)
            onNotification('Failed to load mission data', 'error')
        } finally {
            setIsLoading(false)
        }
    }

    const handleMissionComplete = async (missionId: string) => {
        if (!walletAddress) return

        setIsLoading(true)
        try {
            const result = await starFragmentService.completeMission(walletAddress, missionId)

            if (result.success) {
                const fragmentsEarned = result.rewards
                    .filter(r => r.type === 'star_fragments')
                    .reduce((sum, r) => sum + r.amount, 0)

                onNotification(
                    `Mission completed! Earned ${fragmentsEarned} star fragments! ⭐`,
                    'success'
                )

                await loadPlayerData()
            } else {
                onNotification(result.error || 'Failed to complete mission', 'error')
            }
        } catch (error) {
            onNotification('Failed to complete mission', 'error')
        } finally {
            setIsLoading(false)
        }
    }

    const formatTimeLeft = (expiresAt?: Date) => {
        if (!expiresAt) return ''

        const now = new Date()
        const timeLeft = expiresAt.getTime() - now.getTime()

        if (timeLeft <= 0) return 'Expired'

        const hours = Math.floor(timeLeft / (1000 * 60 * 60))
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))

        if (hours > 0) return `${hours}h ${minutes}m left`
        return `${minutes}m left`
    }

    const getDifficultyColor = (difficulty: string) => {
        switch (difficulty) {
            case 'easy': return '#4ade80'
            case 'medium': return '#fbbf24'
            case 'hard': return '#fb923c'
            case 'legendary': return '#c084fc'
            default: return '#9ca3af'
        }
    }

    const getMissionIcon = (type: string) => {
        switch (type) {
            case 'daily': return '☀️'
            case 'weekly': return '📅'
            case 'season': return '🏆'
            default: return '⭐'
        }
    }

    const renderMission = (mission: Mission) => (
        <View key={mission.id} style={styles.missionCard}>
            <View style={styles.missionHeader}>
                <View style={styles.missionIconTitle}>
                    <Text style={styles.missionIcon}>{getMissionIcon(mission.type)}</Text>
                    <View>
                        <Text style={styles.missionName}>{mission.name}</Text>
                        <Text style={[styles.missionDifficulty, { color: getDifficultyColor(mission.difficulty) }]}>
                            {mission.difficulty}
                        </Text>
                    </View>
                </View>
                {mission.expiresAt && (
                    <Text style={styles.timeLeft}>{formatTimeLeft(mission.expiresAt)}</Text>
                )}
            </View>

            <Text style={styles.missionDescription}>{mission.description}</Text>

            <View style={styles.progressContainer}>
                <View style={styles.progressLabelRow}>
                    <Text style={styles.progressLabel}>Progress</Text>
                    <Text style={styles.progressLabel}>{mission.progress}/{mission.maxProgress}</Text>
                </View>
                <View style={styles.progressBar}>
                    <View
                        style={[styles.progressFill, {
                            width: `${(mission.progress / mission.maxProgress) * 100}%`,
                            backgroundColor: mission.completed ? '#22c55e' : '#3b82f6'
                        }]}
                    />
                </View>
            </View>

            <View style={styles.rewardsContainer}>
                <Text style={styles.rewardsLabel}>Rewards:</Text>
                <View style={styles.rewardsList}>
                    {mission.rewards.map((reward, idx) => (
                        <View key={idx} style={styles.rewardItem}>
                            <Text style={styles.rewardText}>{reward.description}</Text>
                        </View>
                    ))}
                </View>
            </View>

            {mission.completed ? (
                <View style={styles.completedStatus}>
                    <Text style={styles.completedText}>✅ Completed</Text>
                </View>
            ) : mission.progress >= mission.maxProgress ? (
                <TouchableOpacity
                    onPress={() => handleMissionComplete(mission.id)}
                    disabled={isLoading}
                    style={[styles.claimButton, isLoading && styles.disabledButton]}
                >
                    <Text style={styles.buttonText}>{isLoading ? 'Completing...' : 'Claim Rewards!'}</Text>
                </TouchableOpacity>
            ) : (
                <View style={styles.inProgressStatus}>
                    <Text style={styles.inProgressText}>In Progress...</Text>
                </View>
            )}
        </View>
    )

    const renderProgressTab = () => (
        <View>
            <View style={styles.balanceCard}>
                <Text style={styles.balanceIcon}>⭐</Text>
                <Text style={styles.balanceAmount}>
                    {playerProgress?.starFragments.toLocaleString() || 0}
                </Text>
                <Text style={styles.balanceLabel}>Star Fragments</Text>
                <Text style={styles.totalEarned}>
                    Total Earned: {playerProgress?.totalEarned.toLocaleString() || 0}
                </Text>
            </View>

            <View style={styles.statsGrid}>
                <View style={[styles.statCard, { marginRight: 8 }]}>
                    <Text style={styles.statIcon}>🔥</Text>
                    <Text style={[styles.statValue, { color: '#fdba74' }]}>
                        {playerProgress?.currentStreak || 0}
                    </Text>
                    <Text style={styles.statLabel}>Login Streak</Text>
                    <Text style={styles.statSub}>
                        Best: {playerProgress?.longestStreak || 0}
                    </Text>
                </View>

                <View style={styles.statCard}>
                    <Text style={styles.statIcon}>📈</Text>
                    <Text style={[styles.statValue, { color: '#86efac' }]}>
                        Lv.{playerProgress?.level || 1}
                    </Text>
                    <Text style={styles.statLabel}>Player Level</Text>
                    <Text style={styles.statSub}>
                        {playerProgress?.experience || 0} XP
                    </Text>
                </View>
            </View>

            {playerProgress?.seasonProgress && (
                <View style={styles.seasonCard}>
                    <Text style={styles.seasonTitle}>Season {playerProgress.seasonProgress.currentSeason}</Text>
                    <View style={styles.seasonPointsRow}>
                        <Text style={styles.seasonPointsText}>Season Points</Text>
                        <Text style={styles.seasonPointsText}>{playerProgress.seasonProgress.seasonPoints.toLocaleString()}</Text>
                    </View>
                    <View style={styles.seasonInfoRow}>
                        <Text style={styles.seasonInfoText}>Tier: {playerProgress.seasonProgress.seasonTier}</Text>
                        <Text style={styles.seasonInfoText}>
                            Ends: {playerProgress.seasonProgress.seasonEndDate.toLocaleDateString()}
                        </Text>
                    </View>
                    <View style={styles.seasonProgressBar}>
                        <View
                            style={[styles.seasonProgressFill, {
                                width: `${Math.min((playerProgress.seasonProgress.seasonPoints / 10000) * 100, 100)}%`
                            }]}
                        />
                    </View>
                </View>
            )}
        </View>
    )

    if (!walletAddress) {
        return (
            <View style={styles.overlay}>
                <View style={styles.noWalletContainer}>
                    <Text style={styles.title}>Star Fragment Missions</Text>
                    <Text style={styles.message}>Connect your wallet to access missions and track your progress!</Text>
                    <TouchableOpacity
                        onPress={onClose}
                        style={styles.closeButton}
                    >
                        <Text style={styles.buttonText}>Close</Text>
                    </TouchableOpacity>
                </View>
            </View>
        )
    }

    return (
        <View style={styles.overlay}>
            <View style={styles.modalContainer}>
                <View style={styles.header}>
                    <Text style={styles.title}>⭐ Star Fragment Missions</Text>
                    <TouchableOpacity onPress={onClose}>
                        <Text style={styles.closeText}>✕</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.tabContainer}>
                    {[
                        { id: 'daily', label: '☀️ Daily', count: dailyMissions.length },
                        { id: 'weekly', label: '📅 Weekly', count: weeklyMissions.length },
                        { id: 'season', label: '🏆 Season', count: seasonMissions.length },
                        { id: 'progress', label: '📊 Progress', count: 0 }
                    ].map(tab => (
                        <TouchableOpacity
                            key={tab.id}
                            onPress={() => setActiveTab(tab.id as any)}
                            style={[styles.tabButton, activeTab === tab.id ? styles.activeTab : styles.inactiveTab]}
                        >
                            <Text style={activeTab === tab.id ? styles.activeTabText : styles.inactiveTabText}>
                                {tab.label}
                            </Text>
                            {tab.count > 0 && (
                                <View style={styles.tabCount}>
                                    <Text style={styles.tabCountText}>{tab.count}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    ))}
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                    {isLoading ? (
                        <View style={styles.loading}>
                            <ActivityIndicator size="large" color="#3b82f6" />
                            <Text style={styles.loadingText}>Loading missions...</Text>
                        </View>
                    ) : (
                        <>
                            {activeTab === 'daily' && (
                                <View>
                                    <Text style={styles.sectionTitle}>Daily Missions</Text>
                                    {dailyMissions.map(renderMission)}
                                </View>
                            )}

                            {activeTab === 'weekly' && (
                                <View>
                                    <Text style={styles.sectionTitle}>Weekly Missions</Text>
                                    {weeklyMissions.map(renderMission)}
                                </View>
                            )}

                            {activeTab === 'season' && (
                                <View>
                                    <Text style={styles.sectionTitle}>Season Missions</Text>
                                    {seasonMissions.map(renderMission)}
                                </View>
                            )}

                            {activeTab === 'progress' && renderProgressTab()}
                        </>
                    )}
                </ScrollView>

                {playerProgress && activeTab !== 'progress' && (
                    <View style={styles.footer}>
                        <View style={styles.footerStats}>
                            <Text style={styles.footerFragment}>
                                ⭐ {playerProgress.starFragments.toLocaleString()} fragments
                            </Text>
                            <Text style={styles.footerStreak}>
                                🔥 {playerProgress.currentStreak} day streak
                            </Text>
                            <Text style={styles.footerLevel}>
                                📈 Level {playerProgress.level}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => setActiveTab('progress')}>
                            <Text style={styles.footerLinkText}>View Details →</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
        zIndex: 50,
    },
    modalContainer: {
        backgroundColor: '#111827',
        borderRadius: 8,
        width: '100%',
        maxHeight: Dimensions.get('window').height * 0.9,
        borderWidth: 1,
        borderColor: '#374151',
        overflow: 'hidden',
    },
    noWalletContainer: {
        backgroundColor: '#111827',
        borderRadius: 8,
        padding: 24,
        width: '90%',
        borderWidth: 1,
        borderColor: '#374151',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#374151',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    closeText: {
        fontSize: 24,
        color: '#9ca3af',
    },
    tabContainer: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#374151',
    },
    tabButton: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        borderBottomWidth: 2,
    },
    activeTab: {
        borderBottomColor: '#3b82f6',
        backgroundColor: 'rgba(37,99,235,0.1)',
    },
    inactiveTab: {
        borderBottomColor: 'transparent',
    },
    activeTabText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#93c5fd',
    },
    inactiveTabText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#9ca3af',
    },
    tabCount: {
        marginLeft: 4,
        backgroundColor: '#4b5563',
        paddingHorizontal: 4,
        borderRadius: 999,
    },
    tabCountText: {
        fontSize: 12,
        color: '#ffffff',
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
    },
    loading: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    loadingText: {
        color: '#d1d5db',
        marginTop: 8,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 16,
    },
    missionCard: {
        backgroundColor: 'rgba(31,41,55,0.5)',
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: '#374151',
        marginBottom: 16,
    },
    missionHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    missionIconTitle: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    missionIcon: {
        fontSize: 24,
        marginRight: 8,
    },
    missionName: {
        fontWeight: 'bold',
        color: '#ffffff',
    },
    missionDifficulty: {
        fontSize: 12,
        textTransform: 'capitalize',
    },
    timeLeft: {
        fontSize: 12,
        color: '#9ca3af',
    },
    missionDescription: {
        color: '#d1d5db',
        fontSize: 14,
        marginBottom: 12,
    },
    progressContainer: {
        marginBottom: 12,
    },
    progressLabelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    progressLabel: {
        fontSize: 12,
        color: '#9ca3af',
    },
    progressBar: {
        width: '100%',
        backgroundColor: '#374151',
        borderRadius: 999,
        height: 8,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 999,
    },
    rewardsContainer: {
        marginBottom: 12,
    },
    rewardsLabel: {
        fontSize: 12,
        color: '#9ca3af',
        marginBottom: 4,
    },
    rewardsList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    rewardItem: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: 'rgba(37,99,235,0.2)',
        borderRadius: 4,
        marginRight: 4,
        marginBottom: 4,
    },
    rewardText: {
        fontSize: 12,
        color: '#93c5fd',
    },
    completedStatus: {
        alignItems: 'center',
        paddingVertical: 8,
        backgroundColor: 'rgba(22,163,74,0.2)',
        borderRadius: 4,
    },
    completedText: {
        color: '#86efac',
        fontSize: 14,
    },
    claimButton: {
        width: '100%',
        paddingVertical: 8,
        backgroundColor: '#16a34a',
        borderRadius: 4,
        alignItems: 'center',
    },
    disabledButton: {
        backgroundColor: '#4b5563',
    },
    buttonText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    inProgressStatus: {
        alignItems: 'center',
        paddingVertical: 8,
        backgroundColor: 'rgba(75,85,99,0.2)',
        borderRadius: 4,
    },
    inProgressText: {
        color: '#9ca3af',
        fontSize: 14,
    },
    balanceCard: {
        backgroundColor: 'rgba(59,130,246,0.2)',
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(59,130,246,0.3)',
        alignItems: 'center',
        marginBottom: 24,
    },
    balanceIcon: {
        fontSize: 36,
        marginBottom: 8,
    },
    balanceAmount: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fde047',
    },
    balanceLabel: {
        fontSize: 14,
        color: '#d1d5db',
    },
    totalEarned: {
        fontSize: 12,
        color: '#9ca3af',
        marginTop: 4,
    },
    statsGrid: {
        flexDirection: 'row',
        marginBottom: 24,
    },
    statCard: {
        flex: 1,
        backgroundColor: 'rgba(31,41,55,0.5)',
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: '#374151',
        alignItems: 'center',
    },
    statIcon: {
        fontSize: 24,
        marginBottom: 4,
    },
    statValue: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    statLabel: {
        fontSize: 12,
        color: '#d1d5db',
    },
    statSub: {
        fontSize: 12,
        color: '#9ca3af',
    },
    seasonCard: {
        backgroundColor: 'rgba(31,41,55,0.5)',
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: '#374151',
    },
    seasonTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 12,
    },
    seasonPointsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    seasonPointsText: {
        fontSize: 14,
        color: '#d1d5db',
    },
    seasonInfoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    seasonInfoText: {
        fontSize: 12,
        color: '#9ca3af',
    },
    seasonProgressBar: {
        width: '100%',
        backgroundColor: '#374151',
        borderRadius: 999,
        height: 8,
        overflow: 'hidden',
    },
    seasonProgressFill: {
        height: '100%',
        backgroundColor: '#3b82f6',
        borderRadius: 999,
    },
    footer: {
        borderTopWidth: 1,
        borderTopColor: '#374151',
        padding: 16,
        backgroundColor: 'rgba(31,41,55,0.5)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    footerStats: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    footerFragment: {
        color: '#fde047',
        marginRight: 16,
        fontSize: 14,
    },
    footerStreak: {
        color: '#fdba74',
        marginRight: 16,
        fontSize: 14,
    },
    footerLevel: {
        color: '#86efac',
        fontSize: 14,
    },
    footerLinkText: {
        color: '#93c5fd',
        fontSize: 14,
    },
    message: {
        color: '#d1d5db',
        marginBottom: 16,
        fontSize: 16,
    },
    closeButton: {
        width: '100%',
        paddingVertical: 8,
        backgroundColor: '#2563eb',
        borderRadius: 4,
        alignItems: 'center',
    },
})

export default StarFragmentMissions