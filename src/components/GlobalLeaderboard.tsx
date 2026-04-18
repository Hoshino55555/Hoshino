import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { GlobalPointSystem } from '../services/GlobalPointSystem';

interface Props {
    walletAddress?: string;
    onClose: () => void;
}

const GlobalLeaderboard: React.FC<Props> = ({ walletAddress, onClose }) => {
    const [globalPointSystem] = useState(() => walletAddress ? new GlobalPointSystem(walletAddress) : null);
    const [leaderboard, setLeaderboard] = useState<Array<{ rank: number; walletAddress: string; totalPoints: number; moonokoCount: number }>>([]);
    const [userRank, setUserRank] = useState<number | null>(null);
    const [pointsPotential, setPointsPotential] = useState<any>(null);

    useEffect(() => {
        if (globalPointSystem) {
            const loadData = async () => {
                try {
                    const board = await globalPointSystem.getLeaderboard();
                    setLeaderboard(board);

                    const potential = await globalPointSystem.getDailyPointsPotential();
                    setPointsPotential(potential);

                    // Find user's rank (simplified)
                    const userEntry = board.find(entry => entry.walletAddress.includes('...'));
                    if (userEntry) {
                        setUserRank(userEntry.rank);
                    }
                } catch (error) {
                    console.error('Error loading leaderboard data:', error);
                }
            };
            
            loadData();
        }
    }, [globalPointSystem]);

    return (
        <View style={styles.leaderboardOverlay}>
            <View style={styles.leaderboardModal}>
                <ScrollView>
                    <View style={styles.leaderboardHeader}>
                        <Text style={styles.leaderboardHeaderH2}>🏆 Global Leaderboard</Text>
                        <Text style={styles.leaderboardHeaderP}>More moonokos = More points!</Text>
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <Text style={styles.closeBtnText}>×</Text>
                        </TouchableOpacity>
                    </View>

                    {pointsPotential && (
                        <View style={styles.pointsPotential}>
                            <Text style={styles.pointsPotentialH3}>Your Daily Potential</Text>
                            <View style={styles.potentialSummary}>
                                <View style={styles.potentialItem}>
                                    <Text style={styles.potentialLabel}>Current Moonokos:</Text>
                                    <Text style={styles.potentialValue}>{pointsPotential.currentMoonokos}</Text>
                                </View>
                                <View style={styles.potentialItem}>
                                    <Text style={styles.potentialLabel}>Max Daily Points:</Text>
                                    <Text style={styles.potentialValue}>{pointsPotential.maxDailyPoints}</Text>
                                </View>
                                <View style={styles.potentialItem}>
                                    <Text style={styles.potentialLabel}>Multi-Moonoko Bonus:</Text>
                                    <Text style={styles.potentialValue}>+{Math.round((pointsPotential.bonusMultiplier - 1) * 100)}%</Text>
                                </View>
                            </View>
                            <View style={styles.breakdown}>
                                {pointsPotential.breakdown.map((line: string, index: number) => (
                                    <View key={index} style={styles.breakdownLine}>
                                        <Text style={styles.breakdownLineText}>{line}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    <View style={styles.leaderboardTable}>
                        <View style={styles.tableHeader}>
                            <View style={styles.tableColumnRank}><Text style={styles.tableHeaderText}>Rank</Text></View>
                            <View style={styles.tableColumnWallet}><Text style={styles.tableHeaderText}>Wallet</Text></View>
                            <View style={styles.tableColumnMoonokos}><Text style={styles.tableHeaderText}>Moonokos</Text></View>
                            <View style={styles.tableColumnPoints}><Text style={styles.tableHeaderText}>Points</Text></View>
                        </View>
                        {leaderboard.map((entry) => (
                            <View key={entry.rank} style={[styles.tableRow, entry.rank === userRank ? styles.userRow : null]}>
                                <View style={styles.tableColumnRank}><Text style={styles.rank}>{entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}</Text></View>
                                <View style={styles.tableColumnWallet}><Text style={styles.wallet}>{entry.walletAddress}</Text></View>
                                <View style={styles.tableColumnMoonokos}><Text style={styles.moonokos}>{entry.moonokoCount} moonokos</Text></View>
                                <View style={styles.tableColumnPoints}><Text style={styles.points}>{entry.totalPoints.toLocaleString()}</Text></View>
                            </View>
                        ))}
                    </View>

                    <View style={styles.advantages}>
                        <Text style={styles.advantagesH3}>🎁 Multi-Moonoko Advantages</Text>
                        <View style={styles.advantageList}>
                            <View style={styles.advantageItem}>
                                <Text style={styles.advantageIcon}>📈</Text>
                                <Text style={styles.advantageText}>+10% points per additional moonoko</Text>
                            </View>
                            <View style={styles.advantageItem}>
                                <Text style={styles.advantageIcon}>🔥</Text>
                                <Text style={styles.advantageText}>Multiple daily interactions possible</Text>
                            </View>
                            <View style={styles.advantageItem}>
                                <Text style={styles.advantageIcon}>🌟</Text>
                                <Text style={styles.advantageText}>Higher chance of ingredient discoveries</Text>
                            </View>
                            <View style={styles.advantageItem}>
                                <Text style={styles.advantageIcon}>💎</Text>
                                <Text style={styles.advantageText}>Better rewards from completed cycles</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.ctaSection}>
                        <Text style={styles.ctaSectionP}>Want to climb the leaderboard? Mint more moonokos for linear point scaling!</Text>
                        <TouchableOpacity style={styles.mintCta} onPress={onClose}>
                            <Text style={styles.mintCtaText}>Mint More Moonokos! 🚀</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </View>

            {/* Bottom Navigation Buttons */}
            <TouchableOpacity style={styles.bottomButtonLeft} onPress={onClose}>
                <Text>◆</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.bottomButtonCenter} onPress={async () => {
                if (globalPointSystem) {
                    try {
                        const board = await globalPointSystem.getLeaderboard();
                        setLeaderboard(board);
                    } catch (error) {
                        console.error('Error refreshing leaderboard:', error);
                    }
                }
            }}>
                <Text>🔄</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.bottomButtonRight} onPress={onClose}>
                <Text>❌</Text>
            </TouchableOpacity>

            {/* Physical Device Buttons - overlaid on background image */}
            <TouchableOpacity style={styles.deviceButtonLeft} onPress={onClose} />
            <TouchableOpacity style={styles.deviceButtonCenter} onPress={async () => {
                if (globalPointSystem) {
                    try {
                        const board = await globalPointSystem.getLeaderboard();
                        setLeaderboard(board);
                    } catch (error) {
                        console.error('Error refreshing leaderboard:', error);
                    }
                }
            }} />
            <TouchableOpacity style={styles.deviceButtonRight} onPress={onClose} />
        </View>
    );
};

const windowWidth = Dimensions.get('window').width;

const styles = StyleSheet.create({
    leaderboardOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    leaderboardModal: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 24,
        width: '90%',
        maxHeight: '80%',
        position: 'relative',
    },
    leaderboardHeader: {
        alignItems: 'center',
        marginBottom: 20,
        position: 'relative',
    },
    leaderboardHeaderH2: {
        marginBottom: 8,
        color: '#4f46e5',
        fontSize: 14,
        fontFamily: 'Press Start 2P',
    },
    leaderboardHeaderP: {
        color: '#6b7280',
        fontSize: 8,
        fontFamily: 'Press Start 2P',
    },
    closeBtn: {
        position: 'absolute',
        top: 0,
        right: 0,
        backgroundColor: '#ef4444',
        borderRadius: 12,
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeBtnText: {
        color: 'white',
        fontSize: 12,
    },
    pointsPotential: {
        backgroundColor: '#f0f9ff',
        borderWidth: 2,
        borderColor: '#0ea5e9',
        borderRadius: 8,
        padding: 16,
        marginBottom: 20,
    },
    pointsPotentialH3: {
        marginBottom: 12,
        fontSize: 10,
        color: '#0c4a6e',
    },
    potentialSummary: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    potentialItem: {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        borderRadius: 6,
        padding: 8,
        marginHorizontal: 4,
    },
    potentialLabel: {
        fontSize: 7,
        color: '#6b7280',
        marginBottom: 4,
    },
    potentialValue: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#0c4a6e',
    },
    breakdown: {
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        borderRadius: 6,
        padding: 8,
    },
    breakdownLine: {
        marginBottom: 2,
    },
    breakdownLineText: {
        fontSize: 7,
        color: '#374151',
    },
    leaderboardTable: {
        marginBottom: 20,
    },
    tableHeader: {
        flexDirection: 'row',
        padding: 8,
        backgroundColor: '#f3f4f6',
        borderRadius: 6,
        marginBottom: 8,
    },
    tableHeaderText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#374151',
    },
    tableRow: {
        flexDirection: 'row',
        padding: 8,
        borderRadius: 6,
        marginBottom: 4,
        backgroundColor: '#f9fafb',
    },
    userRow: {
        backgroundColor: '#fef3c7',
        borderWidth: 2,
        borderColor: '#f59e0b',
    },
    tableColumnRank: {
        width: 60,
        alignItems: 'center',
    },
    tableColumnWallet: {
        flex: 1,
    },
    tableColumnMoonokos: {
        width: 80,
        alignItems: 'center',
    },
    tableColumnPoints: {
        width: 100,
        alignItems: 'flex-end',
    },
    rank: {
        textAlign: 'center',
        fontWeight: 'bold',
        fontSize: 8,
    },
    wallet: {
        fontFamily: 'monospace',
        fontSize: 7,
    },
    moonokos: {
        textAlign: 'center',
        color: '#059669',
        fontWeight: 'bold',
        fontSize: 8,
    },
    points: {
        textAlign: 'right',
        color: '#dc2626',
        fontWeight: 'bold',
        fontSize: 8,
    },
    advantages: {
        backgroundColor: '#ecfdf5',
        borderWidth: 2,
        borderColor: '#10b981',
        borderRadius: 8,
        padding: 16,
        marginBottom: 20,
    },
    advantagesH3: {
        marginBottom: 12,
        fontSize: 10,
        color: '#047857',
    },
    advantageList: {
        flexDirection: 'column',
    },
    advantageItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        borderRadius: 6,
        padding: 8,
        marginBottom: 8,
    },
    advantageIcon: {
        fontSize: 12,
        marginRight: 8,
    },
    advantageText: {
        fontSize: 7,
        color: '#047857',
    },
    ctaSection: {
        alignItems: 'center',
    },
    ctaSectionP: {
        marginBottom: 12,
        fontSize: 8,
        color: '#6b7280',
    },
    mintCta: {
        backgroundColor: '#4f46e5',
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 20,
        alignItems: 'center',
    },
    mintCtaText: {
        color: 'white',
        fontFamily: 'Press Start 2P',
        fontSize: 8,
    },
    bottomButtonLeft: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        width: 50,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 5,
    },
    bottomButtonCenter: {
        position: 'absolute',
        bottom: 20,
        left: (windowWidth / 2) - 25,
        width: 50,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 5,
    },
    bottomButtonRight: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        width: 50,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 5,
    },
    deviceButtonLeft: {
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: windowWidth / 3,
        height: 100,
    },
    deviceButtonCenter: {
        position: 'absolute',
        left: windowWidth / 3,
        bottom: 0,
        width: windowWidth / 3,
        height: 100,
    },
    deviceButtonRight: {
        position: 'absolute',
        right: 0,
        bottom: 0,
        width: windowWidth / 3,
        height: 100,
    },
});

export default GlobalLeaderboard;