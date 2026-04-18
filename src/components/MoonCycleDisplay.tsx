import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { interpolateColor } from 'react-native-reanimated';
import { MoonCycleService, MoonCycle, IngredientDiscovery } from '../services/MoonCycleService';
import { GlobalPointSystem, GlobalPointsData, PointsReward } from '../services/GlobalPointSystem';

interface Props {
    characterMint: string;
    characterName: string;
    walletAddress?: string;
    onIngredientFound?: (ingredient: IngredientDiscovery) => void;
    onActionComplete?: (actionType: 'feed' | 'sleep' | 'chat', moodBonus: boolean, pointsReward?: PointsReward) => void;
    onTriggerFeedingAnimation?: (foodItem: string) => void;
}

const MoonCycleDisplay: React.FC<Props> = ({
    characterMint,
    characterName,
    walletAddress,
    onIngredientFound,
    onActionComplete,
    onTriggerFeedingAnimation
}) => {
    const [moonCycleService] = useState(() => {
        const service = new MoonCycleService(characterMint, walletAddress);
        return service;
    });
    const [globalPointSystem] = useState(() => walletAddress ? new GlobalPointSystem(walletAddress) : null);
    const [cycleProgress, setCycleProgress] = useState(moonCycleService.getCycleProgress());
    const [currentCycle, setCurrentCycle] = useState<MoonCycle | null>(null);
    const [globalPoints, setGlobalPoints] = useState<GlobalPointsData | null>(null);
    const [showRewards, setShowRewards] = useState(false);
    const [recentIngredient, setRecentIngredient] = useState<IngredientDiscovery | null>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const cycle = await moonCycleService.getCurrentCycle(characterMint);
                setCurrentCycle(cycle);
                updateProgress();

                if (globalPointSystem && walletAddress) {
                    let points = await globalPointSystem.getCurrentPoints();
                    if (!points) {
                        points = await globalPointSystem.initializeUser(walletAddress);
                    }
                    setGlobalPoints(points);
                }

                const reward = await moonCycleService.checkCycleCompletion();
                if (reward) {
                    setShowRewards(true);
                }
            } catch (error) {
                console.error('Error loading moon cycle data:', error);
            }
        };
        
        loadData();
    }, [characterMint, moonCycleService, onIngredientFound, globalPointSystem, walletAddress]);

    const updateProgress = async () => {
        setCycleProgress(moonCycleService.getCycleProgress());
        if (globalPointSystem) {
            const points = await globalPointSystem.getCurrentPoints();
            setGlobalPoints(points);
        }
    };

    const getMoonPhaseEmoji = (day: number): string => {
        const phase = Math.floor(day / 7);
        switch (phase) {
            case 0: return '🌑';
            case 1: return '🌓';
            case 2: return '🌕';
            case 3: return '🌗';
            default: return '🌙';
        }
    };

    const getProgressColor = (achieved: number, needed: number): string => {
        const ratio = achieved / needed;
        if (ratio >= 1) return '#4ade80';
        if (ratio >= 0.8) return '#facc15';
        return '#f87171';
    };

    const handleActionClick = async (actionType: 'feed' | 'sleep' | 'chat') => {
        if (actionType === 'sleep') {
            const today = new Date().toISOString().split('T')[0]
            const todayStats = currentCycle?.dailyStats.find(s => s.date === today)

            if (todayStats?.sleepStartTime) {
                const sleepResult = await moonCycleService.endSleep()
                if (sleepResult.success) {
                    const result = await moonCycleService.recordDailyStats(
                        3,
                        3,
                        sleepResult.energyGained,
                        'sleep',
                        sleepResult.energyGained >= 5 ? 8.5 : sleepResult.energyGained * 1.7,
                        characterName
                    );
                    await updateProgress();
                    onActionComplete?.(actionType, result.moodBonusEarned, result.pointsReward);
                    onIngredientFound?.({
                        id: 'sleep_end',
                        name: sleepResult.message,
                        rarity: sleepResult.stars >= 5 ? 'epic' : 'common',
                        moodBonus: sleepResult.stars >= 5 ? 1 : 0,
                        description: `Slept for ${sleepResult.energyGained >= 5 ? '8.5+' : sleepResult.energyGained * 1.7} hours`
                    });
                }
            } else {
                const sleepStart = await moonCycleService.startSleep()
                if (sleepStart.success) {
                    onIngredientFound?.({
                        id: 'sleep_start',
                        name: 'Sleep Started',
                        rarity: 'common',
                        moodBonus: 0,
                        description: sleepStart.message
                    });
                }
            }
        } else if (actionType === 'feed') {
            const ingredient = moonCycleService.generateIngredientDiscovery()
            const ingredients = ingredient ? [ingredient] : []
            const foodStars = moonCycleService.calculateFoodStars(ingredients)

            const foodItems = ['dream-bean', 'nebula-plum', 'cloud-cake', 'starberry'];
            const selectedFood = ingredient ?
                (ingredient.name.includes('Dream') ? 'dream-bean' :
                    ingredient.name.includes('Nebula') ? 'nebula-plum' :
                        ingredient.name.includes('Cloud') ? 'cloud-cake' :
                            ingredient.name.includes('Star') ? 'starberry' : 'dream-bean') :
                foodItems[Math.floor(Math.random() * foodItems.length)];

            if (onTriggerFeedingAnimation) {
                onTriggerFeedingAnimation(selectedFood);
            }

            const result = moonCycleService.recordDailyStats(
                3,
                foodStars,
                3,
                'feed',
                undefined,
                characterName
            );

            updateProgress();
            onActionComplete?.(actionType, result.moodBonusEarned, result.pointsReward);

            if (ingredient) {
                onIngredientFound?.(ingredient);
            }
        } else if (actionType === 'chat') {
            const result = moonCycleService.recordDailyStats(
                4,
                3,
                3,
                'chat',
                undefined,
                characterName
            );

            updateProgress();
            onActionComplete?.(actionType, result.moodBonusEarned, result.pointsReward);
        }
    };

    const SleepAction = () => {
        const today = new Date().toISOString().split('T')[0];
        const todayStats = currentCycle?.dailyStats.find(s => s.date === today);
        const isSleeping = !!todayStats?.sleepStartTime;
        const isCompleted = cycleProgress.todayCompleted.sleep;
        let baseStyle = [styles.actionItem];
        if (isCompleted) baseStyle = [...baseStyle, styles.actionItemCompleted];
        if (isSleeping) baseStyle = [...baseStyle, styles.actionItemSleeping];

        if (isSleeping) {
            const progress = useSharedValue(0);
            useEffect(() => {
                progress.value = withRepeat(withTiming(1, { duration: 2000 }), -1, true);
            }, []);
            const animatedStyle = useAnimatedStyle(() => ({
                backgroundColor: interpolateColor(progress.value, [0, 0.5, 1], ['#ddd6fe', '#c4b5fd', '#ddd6fe']),
            }));
            return (
                <TouchableOpacity onPress={() => handleActionClick('sleep')} activeOpacity={0.7}>
                    <Animated.View style={[baseStyle, animatedStyle]}>
                        <Text style={styles.actionIcon}>😴💤</Text>
                        <Text style={styles.actionName}>Wake Up</Text>
                        {isCompleted && <Text style={styles.check}>✅</Text>}
                    </Animated.View>
                </TouchableOpacity>
            );
        } else {
            return (
                <TouchableOpacity style={baseStyle} onPress={() => handleActionClick('sleep')} activeOpacity={0.7}>
                    <Text style={styles.actionIcon}>😴</Text>
                    <Text style={styles.actionName}>Sleep</Text>
                    {isCompleted && <Text style={styles.check}>✅</Text>}
                </TouchableOpacity>
            );
        }
    };

    const ratio = cycleProgress.moodDaysAchieved / cycleProgress.moodDaysNeeded;
    const progressColor = getProgressColor(cycleProgress.moodDaysAchieved, cycleProgress.moodDaysNeeded);

    return (
        <View style={styles.moonCycleContainer}>
            <View style={styles.moonCycleHeader}>
                <View style={styles.moonPhase}>
                    <Text style={styles.moonEmoji}>{getMoonPhaseEmoji(cycleProgress.currentDay)}</Text>
                    <View style={styles.cycleInfo}>
                        <Text style={styles.cycleInfoH3}>Moon Cycle</Text>
                        <Text style={styles.cycleInfoP}>Day {cycleProgress.currentDay}/28</Text>
                    </View>
                </View>
                <View style={styles.daysRemaining}>
                    <Text style={styles.daysNumber}>{cycleProgress.daysRemaining}</Text>
                    <Text style={styles.daysLabel}>days left</Text>
                </View>
            </View>

            <View style={styles.moodProgress}>
                <View style={styles.progressHeader}>
                    <Text style={styles.progressHeaderH4}>Mood Goal Progress</Text>
                    <Text style={[styles.status, cycleProgress.onTrack ? styles.statusOnTrack : styles.statusBehind]}>
                        {cycleProgress.onTrack ? '✨ On Track' : '⚠️ Behind'}
                    </Text>
                </View>
                <View style={styles.progressBarContainer}>
                    <LinearGradient
                        colors={[progressColor, progressColor, '#e5e7eb', '#e5e7eb']}
                        locations={[0, ratio, ratio, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.progressBar}
                    >
                        <Text style={styles.progressText}>
                            {cycleProgress.moodDaysAchieved}/{cycleProgress.moodDaysNeeded} days
                        </Text>
                    </LinearGradient>
                </View>
            </View>

            {globalPoints && walletAddress && (
                <LinearGradient
                    colors={['#f0f9ff', '#e0f2fe']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.globalPoints}
                >
                    <View style={styles.pointsHeader}>
                        <Text style={styles.pointsHeaderH4}>Global Points</Text>
                        <Text style={styles.totalPoints}>{globalPoints.totalPoints.toLocaleString()}</Text>
                    </View>
                    <View style={styles.pointsDetails}>
                        <View style={styles.pointItem}>
                            <Text style={styles.pointLabel}>Today:</Text>
                            <Text style={styles.pointValue}>{globalPoints.dailyPoints}</Text>
                        </View>
                        <View style={styles.pointItem}>
                            <Text style={styles.pointLabel}>Moonokos:</Text>
                            <Text style={styles.pointValue}>{globalPoints.moonokos.length}</Text>
                        </View>
                        <View style={styles.pointItem}>
                            <Text style={styles.pointLabel}>Streak:</Text>
                            <Text style={styles.pointValue}>{globalPoints.currentStreak} days</Text>
                        </View>
                    </View>
                    {globalPoints.moonokos.length > 1 && (
                        <LinearGradient
                            colors={['#fef3c7', '#fde68a']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.multiMoonokoBonus}
                        >
                                                          <Text style={styles.multiMoonokoBonusText}>🎁 Multi-Moonoko Bonus: +{Math.round((globalPoints.moonokos.length - 1) * 10)}% points!</Text>
                        </LinearGradient>
                    )}
                </LinearGradient>
            )}

            <View style={[styles.dailyActions, { display: 'none' }]}>
                <Text style={styles.dailyActionsH4}>Today's Actions</Text>
                <View style={styles.actionGrid}>
                    <TouchableOpacity
                        style={[styles.actionItem, cycleProgress.todayCompleted.feed ? styles.actionItemCompleted : null]}
                        onPress={() => !cycleProgress.todayCompleted.feed && handleActionClick('feed')}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.actionIcon}>🍜</Text>
                        <Text style={styles.actionName}>Feed</Text>
                        {cycleProgress.todayCompleted.feed && <Text style={styles.check}>✅</Text>}
                    </TouchableOpacity>
                    <SleepAction />
                    <TouchableOpacity
                        style={[styles.actionItem, cycleProgress.todayCompleted.chat ? styles.actionItemCompleted : null]}
                        onPress={() => !cycleProgress.todayCompleted.chat && handleActionClick('chat')}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.actionIcon}>💬</Text>
                        <Text style={styles.actionName}>Chat</Text>
                        {cycleProgress.todayCompleted.chat && <Text style={styles.check}>✅</Text>}
                    </TouchableOpacity>
                </View>
                {cycleProgress.todayCompleted.moodBonus && (
                    <LinearGradient
                        colors={['#fef3c7', '#fde68a']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.moodBonusEarned}
                    >
                        <Text style={styles.moodBonusEarnedText}>✨ Today's mood bonus earned!</Text>
                    </LinearGradient>
                )}
            </View>

            {recentIngredient && (
                <LinearGradient
                    colors={['#ede9fe', '#ddd6fe']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.ingredientDiscovery}
                >
                    <Text style={styles.ingredientDiscoveryH4}>🎯 Ingredient Found!</Text>
                    <LinearGradient
                        colors={recentIngredient.rarity === 'legendary' ? ['#fef3c7', '#fde68a'] : ['#ede9fe', '#ddd6fe']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.ingredientItem, { borderColor: recentIngredient.rarity === 'legendary' ? '#f59e0b' : '#8b5cf6' }]}
                    >
                        <View style={styles.ingredientInfo}>
                            <Text style={styles.ingredientInfoStrong}>{recentIngredient.name}</Text>
                            <Text style={styles.ingredientInfoP}>{recentIngredient.description}</Text>
                            {characterName === 'Lyra' && recentIngredient.characterSpecific && (
                                <Text style={[styles.ingredientInfoP, styles.characterReaction]}>{recentIngredient.characterSpecific}</Text>
                            )}
                        </View>
                        <Text style={styles.moodBonus}>+{recentIngredient.moodBonus} 🌟</Text>
                    </LinearGradient>
                </LinearGradient>
            )}

            <View style={styles.rewardsPreview}>
                <Text style={styles.rewardsPreviewH4}>Cycle Rewards</Text>
                <View style={styles.rewardTiers}>
                    <View style={[styles.rewardTier, cycleProgress.moodDaysAchieved >= 24 ? styles.rewardTierAchievable : styles.rewardTierLocked]}>
                        <Text style={styles.tierIcon}>🏆</Text>
                        <Text style={styles.tierName}>Good (24+ days)</Text>
                    </View>
                    <View style={[styles.rewardTier, cycleProgress.moodDaysAchieved >= 28 ? styles.rewardTierAchievable : styles.rewardTierLocked]}>
                        <Text style={styles.tierIcon}>👑</Text>
                        <Text style={styles.tierName}>Perfect (28 days)</Text>
                    </View>
                </View>
            </View>

            {showRewards && currentCycle?.finalReward && (
                <Modal
                    visible={showRewards}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowRewards(false)}
                >
                    <View style={styles.rewardModalOverlay}>
                        <View style={styles.rewardModal}>
                            <Text style={styles.rewardModalH2}>🌙 Moon Cycle Complete!</Text>
                            <View style={styles.finalStats}>
                                <Text style={styles.finalStatsP}>
                                    Mood Days Achieved: <Text style={styles.finalStatsStrong}>{currentCycle.finalReward.moodDaysAchieved}/28</Text>
                                </Text>
                                <Text style={styles.finalStatsP}>
                                    Result: <Text style={[styles.result, styles[`result${currentCycle.finalReward.rewardType.charAt(0).toUpperCase() + currentCycle.finalReward.rewardType.slice(1)}`]]}>
                                        {currentCycle.finalReward.rewardType.toUpperCase()}
                                    </Text>
                                </Text>
                            </View>
                            <View style={styles.rewardsList}>
                                <Text style={styles.rewardsListH3}>Rewards Earned:</Text>
                                {currentCycle.finalReward.rewards.map((reward, index) => (
                                    <View key={index} style={styles.rewardItem}>
                                        <Text>✨ {reward}</Text>
                                    </View>
                                ))}
                                {currentCycle.finalReward.nftBonus && (
                                    <LinearGradient
                                        colors={['#fef3c7', '#fde68a']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.nftBonus}
                                    >
                                        <Text>🎨 {currentCycle.finalReward.nftBonus}</Text>
                                    </LinearGradient>
                                )}
                            </View>
                            <TouchableOpacity onPress={() => setShowRewards(false)} activeOpacity={0.7}>
                                <LinearGradient
                                    colors={['#4f46e5', '#7c3aed']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.claimButtonGradient}
                                >
                                    <Text style={styles.claimButtonText}>Claim Rewards</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    moonCycleContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderWidth: 3,
        borderColor: '#4f46e5',
        borderRadius: 12,
        padding: 16,
        margin: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 5,
    },
    moonCycleHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    moonPhase: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    moonEmoji: {
        fontSize: 32,
        marginRight: 12,
    },
    cycleInfo: {},
    cycleInfoH3: {
        margin: 0,
        color: '#4f46e5',
        fontSize: 18,
    },
    cycleInfoP: {
        margin: 0,
        color: '#6b7280',
        fontSize: 14,
    },
    daysRemaining: {
        alignItems: 'center',
    },
    daysNumber: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#dc2626',
    },
    daysLabel: {
        fontSize: 12,
        color: '#6b7280',
    },
    moodProgress: {
        marginBottom: 16,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    progressHeaderH4: {
        margin: 0,
        color: '#374151',
    },
    status: {
        fontWeight: 'bold',
    },
    statusOnTrack: {
        color: '#059669',
    },
    statusBehind: {
        color: '#dc2626',
    },
    progressBarContainer: {
        height: 24,
        backgroundColor: '#e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
    },
    progressBar: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 12,
        textShadowColor: 'rgba(0, 0, 0, 0.5)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 2,
    },
    globalPoints: {
        borderWidth: 2,
        borderColor: '#0ea5e9',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
    },
    pointsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    pointsHeaderH4: {
        margin: 0,
        color: '#0c4a6e',
    },
    totalPoints: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#0ea5e9',
    },
    pointsDetails: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 8,
    },
    pointItem: {
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        borderRadius: 6,
        padding: 6,
        flex: 1,
    },
    pointLabel: {
        fontSize: 10,
        color: '#6b7280',
        marginBottom: 2,
    },
    pointValue: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#0c4a6e',
    },
    multiMoonokoBonus: {
        borderWidth: 2,
        borderColor: '#f59e0b',
        borderRadius: 6,
        padding: 8,
    },
    multiMoonokoBonusText: {
        textAlign: 'center',
        fontSize: 10,
        fontWeight: 'bold',
        color: '#92400e',
    },
    dailyActions: {
        marginBottom: 16,
    },
    dailyActionsH4: {
        marginBottom: 12,
        color: '#374151',
    },
    actionGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    actionItem: {
        flexDirection: 'column',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#f3f4f6',
        borderWidth: 2,
        borderColor: '#d1d5db',
        borderRadius: 8,
        flex: 1,
    },
    actionItemCompleted: {
        backgroundColor: '#dcfce7',
        borderColor: '#16a34a',
    },
    actionItemSleeping: {
        borderColor: '#7c3aed',
    },
    actionIcon: {
        fontSize: 24,
        marginBottom: 4,
    },
    actionName: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#374151',
    },
    check: {
        position: 'absolute',
        top: 4,
        right: 4,
        fontSize: 12,
    },
    moodBonusEarned: {
        borderWidth: 2,
        borderColor: '#f59e0b',
        borderRadius: 8,
        padding: 8,
    },
    moodBonusEarnedText: {
        textAlign: 'center',
        fontWeight: 'bold',
        color: '#92400e',
    },
    ingredientDiscovery: {
        marginBottom: 16,
        borderWidth: 2,
        borderColor: '#8b5cf6',
        borderRadius: 8,
        padding: 12,
    },
    ingredientDiscoveryH4: {
        marginBottom: 8,
        color: '#6b21a8',
    },
    ingredientItem: {
        borderWidth: 2,
        borderRadius: 6,
        padding: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    ingredientInfo: {},
    ingredientInfoStrong: {
        color: '#374151',
        fontWeight: 'bold',
    },
    ingredientInfoP: {
        marginVertical: 4,
        fontSize: 12,
        color: '#6b7280',
    },
    characterReaction: {
        fontStyle: 'italic',
        color: '#ec4899',
    },
    moodBonus: {
        fontWeight: 'bold',
        color: '#f59e0b',
    },
    rewardsPreview: {},
    rewardsPreviewH4: {
        marginBottom: 8,
        color: '#374151',
    },
    rewardTiers: {
        flexDirection: 'row',
    },
    rewardTier: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        borderRadius: 6,
        marginRight: 8,
    },
    rewardTierAchievable: {
        backgroundColor: '#dcfce7',
        borderWidth: 2,
        borderColor: '#16a34a',
        color: '#15803d',
    },
    rewardTierLocked: {
        backgroundColor: '#f3f4f6',
        borderWidth: 2,
        borderColor: '#d1d5db',
        color: '#9ca3af',
    },
    tierIcon: {
        marginRight: 6,
    },
    tierName: {
        fontSize: 12,
    },
    rewardModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    rewardModal: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 24,
        width: '90%',
        maxWidth: 400,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.1,
        shadowRadius: 25,
        elevation: 10,
    },
    rewardModalH2: {
        textAlign: 'center',
        marginBottom: 16,
        color: '#4f46e5',
    },
    finalStats: {
        backgroundColor: '#f9fafb',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
    },
    finalStatsP: {
        marginVertical: 4,
    },
    finalStatsStrong: {
        fontWeight: 'bold',
    },
    result: {
        fontWeight: 'bold',
    },
    resultPerfect: {
        color: '#059669',
    },
    resultGood: {
        color: '#2563eb',
    },
    resultBasic: {
        color: '#dc2626',
    },
    rewardsList: {},
    rewardsListH3: {
        marginBottom: 8,
        color: '#374151',
    },
    rewardItem: {
        backgroundColor: '#f3f4f6',
        borderRadius: 6,
        padding: 8,
        marginVertical: 4,
    },
    nftBonus: {
        borderWidth: 2,
        borderColor: '#f59e0b',
        borderRadius: 6,
        padding: 8,
        marginVertical: 4,
    },
    claimButtonGradient: {
        borderRadius: 8,
        padding: 12,
        alignItems: 'center',
    },
    claimButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
});

export default MoonCycleDisplay;