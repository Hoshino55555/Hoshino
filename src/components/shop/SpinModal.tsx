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
import { Stars, ShopItems, getIngredientArt } from '../../assets';
import type { DailySpinReward } from '../../services/StarFragmentService';
import { ingredientLabel } from '../../services/RecipeCatalog';
import { colors, fonts } from '../../styles/tokens';

export type SpinPhase = 'idle' | 'spinning' | 'revealed';

export type ReelTile =
    | { kind: 'starFragments'; amount: number; color: string }
    | {
          kind: 'ingredient';
          tier: 'common' | 'uncommon' | 'rare' | 'ultra_rare';
          previewId: string;
          color: string;
      }
    | { kind: 'booster'; color: string };

// Booster skuId → preview art for reveal display. Pool/reel tiles use a
// single representative icon (snoozeSeed) since the spin slot is "any
// booster" and the actual SKU is chosen server-side.
const BOOSTER_ART: Record<string, any> = {
    'booster-mood': ShopItems.moonokoBall,
    'booster-sleep': ShopItems.snoozeSeed,
    'booster-hunger': ShopItems.starberry,
};
const BOOSTER_LABEL: Record<string, string> = {
    'booster-mood': 'Mood Booster',
    'booster-sleep': 'Sleep Booster',
    'booster-hunger': 'Hunger Booster',
};
const BOOSTER_TILE_COLOR = '#E0B33A';

// Daily-spin reel preview pool. Mirrors backend SPIN_POOL — each entry is
// one outcome the server can roll (4 ingredient tiers + 3 SF amounts).
// Ingredient tiles show a representative icon; the actual ingredient is
// chosen server-side from the tier bucket and revealed on landing.
export const TIER_TILE_COLOR = {
    common: '#8B8B8B',
    uncommon: '#4CAF50',
    rare: '#2196F3',
    ultra_rare: '#9C27B0',
} as const;

export const REEL_TILES: ReelTile[] = [
    { kind: 'ingredient',    tier: 'common',     previewId: 'egg',        color: TIER_TILE_COLOR.common },
    { kind: 'ingredient',    tier: 'uncommon',   previewId: 'strawberry', color: TIER_TILE_COLOR.uncommon },
    { kind: 'starFragments', amount: 250,                                 color: '#FF9800' },
    { kind: 'ingredient',    tier: 'common',     previewId: 'lettuce',    color: TIER_TILE_COLOR.common },
    { kind: 'ingredient',    tier: 'rare',       previewId: 'bacon',      color: TIER_TILE_COLOR.rare },
    { kind: 'booster',                                                    color: BOOSTER_TILE_COLOR },
    { kind: 'ingredient',    tier: 'uncommon',   previewId: 'tomato',     color: TIER_TILE_COLOR.uncommon },
    { kind: 'ingredient',    tier: 'rare',       previewId: 'tuna',       color: TIER_TILE_COLOR.rare },
    { kind: 'ingredient',    tier: 'ultra_rare', previewId: 'star_dust',  color: TIER_TILE_COLOR.ultra_rare },
    { kind: 'ingredient',    tier: 'common',     previewId: 'carrot',     color: TIER_TILE_COLOR.common },
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
// can decelerate to the correct visual landing tile. Prefers the exact
// ingredient (when a tile happens to mirror its previewId), otherwise
// falls back to the first tile of the matching tier. Falls back to 0 if
// nothing matches.
export function findReelIndex(reward: {
    kind: 'starFragments' | 'ingredient' | 'booster';
    amount?: number;
    tier?: string;
    id?: string;
}): number {
    if (reward.kind === 'ingredient' && reward.id) {
        const exact = REEL_TILES.findIndex(
            (t) => t.kind === 'ingredient' && t.previewId === reward.id
        );
        if (exact >= 0) return exact;
    }
    const idx = REEL_TILES.findIndex((t) => {
        if (t.kind !== reward.kind) return false;
        if (t.kind === 'starFragments' && reward.kind === 'starFragments') {
            return t.amount === reward.amount;
        }
        if (t.kind === 'ingredient' && reward.kind === 'ingredient') {
            return t.tier === reward.tier;
        }
        if (t.kind === 'booster' && reward.kind === 'booster') {
            return true;
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
                            <Image
                                source={
                                    t.kind === 'starFragments'
                                        ? Stars.fragment
                                        : t.kind === 'booster'
                                            ? ShopItems.snoozeSeed
                                            : getIngredientArt(t.previewId)
                                }
                                style={styles.poolIcon}
                                resizeMode="contain"
                            />
                            {t.kind === 'starFragments' && (
                                <Text style={styles.poolStarText}>{t.amount}</Text>
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
                                        <Image
                                            source={
                                                t.kind === 'starFragments'
                                                    ? Stars.fragment
                                                    : t.kind === 'booster'
                                                        ? ShopItems.snoozeSeed
                                                        : getIngredientArt(t.previewId)
                                            }
                                            style={styles.reelTileIcon}
                                            resizeMode="contain"
                                        />
                                        {t.kind === 'starFragments' && (
                                            <Text style={styles.reelStarText}>{t.amount}</Text>
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
                                            ? TIER_TILE_COLOR[reward.tier as keyof typeof TIER_TILE_COLOR]
                                            : reward.kind === 'booster'
                                                ? BOOSTER_TILE_COLOR
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
                            ) : reward.kind === 'booster' ? (
                                <>
                                    <Image
                                        source={BOOSTER_ART[reward.skuId] ?? ShopItems.snoozeSeed}
                                        style={styles.revealIcon}
                                        resizeMode="contain"
                                    />
                                    <Text style={styles.revealText}>
                                        {BOOSTER_LABEL[reward.skuId] ?? 'Booster'} ×{reward.qty}
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
        minWidth: 376,
        maxWidth: 400,
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
        maxWidth: 330,
    },
    poolTile: {
        width: 60,
        height: 60,
        borderWidth: 2,
        backgroundColor: '#fdfaee',
        margin: 3,
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        padding: 2,
    },
    poolIcon: {
        width: 40,
        height: 40,
    },
    poolStarText: {
        position: 'absolute',
        bottom: 2,
        right: 3,
        fontFamily: fonts.pixel,
        fontSize: 10,
        color: colors.slotInk,
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
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        padding: 6,
    },
    reelTileIcon: {
        width: 56,
        height: 56,
    },
    reelStarText: {
        position: 'absolute',
        bottom: 4,
        right: 6,
        fontFamily: fonts.pixel,
        fontSize: 16,
        color: colors.slotInk,
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
