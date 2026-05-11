import React from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Image,
    Animated,
} from 'react-native';
import { Stars, getIngredientArt } from '../../assets';
import type { DailySpinReward } from '../../services/StarFragmentService';
import { ingredientLabel } from '../../services/RecipeCatalog';
import { colors, fonts } from '../../styles/tokens';

export type SpinPhase = 'idle' | 'spinning' | 'revealed';

export type ReelTile =
    | { kind: 'starFragments'; amount: number; color: string }
    | {
          kind: 'ingredient';
          id: string;
          tier: 'common' | 'uncommon' | 'rare' | 'ultra_rare';
          color: string;
      };

// Daily-spin reel preview pool. Mirrors backend SPIN_POOL — every distinct
// reward type is shown so the player knows what's possible. Tier color
// follows ingredient tier accents (matches Inventory + Feeding pages).
export const TIER_TILE_COLOR = {
    common: '#8B8B8B',
    uncommon: '#4CAF50',
    rare: '#2196F3',
    ultra_rare: '#9C27B0',
} as const;

export const REEL_TILES: ReelTile[] = [
    { kind: 'ingredient', id: 'egg',        tier: 'common',     color: TIER_TILE_COLOR.common },
    { kind: 'starFragments', amount: 10,    color: colors.forestDark },
    { kind: 'ingredient', id: 'lettuce',    tier: 'common',     color: TIER_TILE_COLOR.common },
    { kind: 'ingredient', id: 'strawberry', tier: 'uncommon',   color: TIER_TILE_COLOR.uncommon },
    { kind: 'starFragments', amount: 50,    color: colors.forestDark },
    { kind: 'ingredient', id: 'tomato',     tier: 'uncommon',   color: TIER_TILE_COLOR.uncommon },
    { kind: 'ingredient', id: 'bacon',      tier: 'rare',       color: TIER_TILE_COLOR.rare },
    { kind: 'ingredient', id: 'milk',       tier: 'rare',       color: TIER_TILE_COLOR.rare },
    { kind: 'starFragments', amount: 250,   color: '#FF9800' },
    { kind: 'ingredient', id: 'star_dust',  tier: 'ultra_rare', color: TIER_TILE_COLOR.ultra_rare },
];

export const REEL_TILE_SIZE = 84;
export const REEL_TILE_GAP = 8;
export const REEL_STEP = REEL_TILE_SIZE + REEL_TILE_GAP;
// Viewport renders three tiles centered around the pointer at x=50%. The
// track has paddingHorizontal: REEL_TILE_GAP/2 and each tile has
// marginHorizontal: REEL_TILE_GAP/2, so tile-0's center sits at
// REEL_TILE_GAP + REEL_TILE_SIZE/2 from the track's left edge.
const REEL_VIEWPORT_WIDTH = REEL_TILE_SIZE * 3 + REEL_TILE_GAP * 2 + 8;
const REEL_VIEWPORT_CENTER = REEL_VIEWPORT_WIDTH / 2;
const REEL_TILE_CENTER_OFFSET = REEL_TILE_GAP + REEL_TILE_SIZE / 2;
// Spin reel renders three REEL_TILES copies stitched together so the
// translate animation never visibly wraps. Hoist the spread once so the
// 30-element array isn't rebuilt every render while the modal is open.
const REEL_TRACK_TILES: ReelTile[] = [...REEL_TILES, ...REEL_TILES, ...REEL_TILES];

// Match a server-granted reward to its index in REEL_TILES so the reel
// can decelerate to the correct visual landing tile. Falls back to 0 if
// nothing matches (shouldn't happen — server pool mirrors REEL_TILES).
export function findReelIndex(reward: {
    kind: 'starFragments' | 'ingredient';
    amount?: number;
    id?: string;
}): number {
    const idx = REEL_TILES.findIndex((t) => {
        if (t.kind !== reward.kind) return false;
        if (t.kind === 'starFragments' && reward.kind === 'starFragments') {
            return t.amount === reward.amount;
        }
        if (t.kind === 'ingredient' && reward.kind === 'ingredient') {
            return t.id === reward.id;
        }
        return false;
    });
    return idx >= 0 ? idx : 0;
}

// translateX such that the tile at `trackIndex` (within REEL_TRACK_TILES)
// is centered under the viewport pointer. `cyclesAhead` controls how many
// full REEL_TILES cycles the reel sweeps past before landing — bump this
// up for a longer-feeling spin.
export function computeLandingTranslateX(
    rewardIndex: number,
    cyclesAhead: number = 2
): number {
    const trackIndex = cyclesAhead * REEL_TILES.length + rewardIndex;
    return REEL_VIEWPORT_CENTER - (REEL_TILE_CENTER_OFFSET + trackIndex * REEL_STEP);
}

interface Props {
    phase: SpinPhase;
    reward: DailySpinReward | null;
    reelTranslateX: Animated.Value;
    revealScale: Animated.Value;
    revealGlow: Animated.Value;
    onClose: () => void;
}

const SpinModal: React.FC<Props> = ({
    phase,
    reward,
    reelTranslateX,
    revealScale,
    revealGlow,
    onClose,
}) => (
    <Modal
        transparent
        visible={phase !== 'idle'}
        animationType="fade"
        onRequestClose={onClose}
    >
        <View style={styles.backdrop}>
            <View style={styles.card}>
                <Text style={styles.title}>
                    {phase === 'revealed' ? 'You won!' : 'Daily Spin'}
                </Text>

                <Text style={styles.poolLabel}>Possible rewards</Text>
                <View style={styles.poolGrid}>
                    {REEL_TILES.map((t, i) => (
                        <View
                            key={`pool-${i}`}
                            style={[styles.poolTile, { borderColor: t.color }]}
                        >
                            {t.kind === 'starFragments' ? (
                                <>
                                    <Image
                                        source={Stars.fragment}
                                        style={styles.poolIcon}
                                        resizeMode="contain"
                                    />
                                    <Text style={styles.poolText}>×{t.amount}</Text>
                                </>
                            ) : (
                                <Image
                                    source={getIngredientArt(t.id)}
                                    style={styles.poolIcon}
                                    resizeMode="contain"
                                />
                            )}
                        </View>
                    ))}
                </View>

                {phase === 'spinning' && (
                    <>
                        <View style={styles.reelViewport}>
                            <View style={styles.reelPointer} />
                            <Animated.View
                                style={[
                                    styles.reelTrack,
                                    { transform: [{ translateX: reelTranslateX }] },
                                ]}
                            >
                                {REEL_TRACK_TILES.map((t, i) => (
                                    <View
                                        key={`reel-${i}`}
                                        style={[styles.reelTile, { borderColor: t.color }]}
                                    >
                                        {t.kind === 'starFragments' ? (
                                            <>
                                                <Image
                                                    source={Stars.fragment}
                                                    style={styles.reelTileIcon}
                                                    resizeMode="contain"
                                                />
                                                <Text style={styles.reelTileText}>×{t.amount}</Text>
                                            </>
                                        ) : (
                                            <Image
                                                source={getIngredientArt(t.id)}
                                                style={styles.reelTileIcon}
                                                resizeMode="contain"
                                            />
                                        )}
                                    </View>
                                ))}
                            </Animated.View>
                        </View>
                        <Text style={styles.status}>Spinning…</Text>
                    </>
                )}

                {phase === 'revealed' && reward && (
                    <>
                        <Animated.View
                            style={[
                                styles.revealTile,
                                {
                                    transform: [{ scale: revealScale }],
                                    shadowOpacity: revealGlow,
                                    borderColor:
                                        reward.kind === 'ingredient'
                                            ? TIER_TILE_COLOR[reward.tier]
                                            : '#FF9800',
                                },
                            ]}
                        >
                            {reward.kind === 'starFragments' ? (
                                <>
                                    <Image
                                        source={Stars.fragment}
                                        style={styles.revealIcon}
                                        resizeMode="contain"
                                    />
                                    <Text style={styles.revealText}>
                                        +{reward.amount} Shards
                                    </Text>
                                </>
                            ) : (
                                <>
                                    <Image
                                        source={getIngredientArt(reward.id)}
                                        style={styles.revealIcon}
                                        resizeMode="contain"
                                    />
                                    <Text style={styles.revealText}>
                                        {ingredientLabel(reward.id)} ×{reward.qty}
                                    </Text>
                                </>
                            )}
                        </Animated.View>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={onClose}
                        >
                            <Text style={styles.closeText}>NICE</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </View>
    </Modal>
);

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    card: {
        backgroundColor: '#f5eed6',
        borderWidth: 3,
        borderColor: colors.slotInk,
        padding: 20,
        alignItems: 'center',
        minWidth: 320,
        maxWidth: 380,
    },
    title: {
        fontFamily: fonts.body,
        fontSize: 30,
        color: colors.slotInk,
        marginBottom: 12,
    },
    poolLabel: {
        fontFamily: fonts.body,
        fontSize: 21,
        color: '#5a4a3a',
        marginBottom: 6,
    },
    poolGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        marginBottom: 14,
        maxWidth: 340,
    },
    poolTile: {
        width: 44,
        height: 44,
        borderWidth: 2,
        backgroundColor: '#fdfaee',
        margin: 3,
        alignItems: 'center',
        justifyContent: 'center',
    },
    poolIcon: {
        width: 28,
        height: 28,
    },
    poolText: {
        fontFamily: fonts.body,
        fontSize: 18,
        color: colors.slotInk,
        marginTop: -2,
    },
    reelViewport: {
        height: REEL_TILE_SIZE + 16,
        width: REEL_TILE_SIZE * 3 + REEL_TILE_GAP * 2 + 8,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: colors.slotInk,
        backgroundColor: '#fdfaee',
        marginBottom: 10,
        justifyContent: 'center',
    },
    reelPointer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: '50%',
        marginLeft: -1,
        width: 2,
        backgroundColor: '#FF9800',
        zIndex: 2,
    },
    reelTrack: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: REEL_TILE_GAP / 2,
    },
    reelTile: {
        width: REEL_TILE_SIZE,
        height: REEL_TILE_SIZE,
        borderWidth: 2,
        backgroundColor: '#f5eed6',
        marginHorizontal: REEL_TILE_GAP / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    reelTileIcon: {
        width: 48,
        height: 48,
    },
    reelTileText: {
        fontFamily: fonts.body,
        fontSize: 21,
        color: colors.slotInk,
        marginTop: 2,
    },
    status: {
        fontFamily: fonts.body,
        fontSize: 21,
        color: colors.slotInk,
        marginBottom: 10,
    },
    revealTile: {
        width: 140,
        height: 140,
        borderWidth: 4,
        backgroundColor: '#fdfaee',
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 10,
        shadowColor: '#FF9800',
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 18,
        elevation: 8,
    },
    revealIcon: {
        width: 72,
        height: 72,
    },
    revealText: {
        fontFamily: fonts.body,
        fontSize: 24,
        color: colors.slotInk,
        marginTop: 6,
        textAlign: 'center',
        paddingHorizontal: 4,
    },
    closeButton: {
        backgroundColor: '#9ed5c5',
        borderWidth: 2,
        borderColor: colors.slotInk,
        paddingHorizontal: 18,
        paddingVertical: 8,
        marginTop: 6,
    },
    closeText: {
        fontFamily: fonts.body,
        fontSize: 21,
        color: colors.slotInk,
    },
});

export default SpinModal;
