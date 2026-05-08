import React, { useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ImageBackground,
    ScrollView,
    Modal,
    Image,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGameStateContext } from '../contexts/GameStateContext';
import {
    RECIPES,
    INGREDIENT_TIER,
    ingredientLabel,
    type Recipe,
    type IngredientId,
    type IngredientTier,
} from '../services/RecipeCatalog';
import type { CookResponse, IngredientCounts } from '../services/GameStateService';
import { Backgrounds, getIngredientArt, getRecipeArt, RecipeCards } from '../assets';

// Tier rule for the recipe-card background art: any recipe whose multiset
// touches a rare or ultra_rare ingredient promotes to the rainbow RARE card,
// otherwise COMMON. Lives here (not in the asset module) so the catalog stays
// art-agnostic and the rule can shift without re-touching assets/index.
function recipeCardArt(recipe: Recipe) {
    const promoted = recipe.ingredients.some((ing) => {
        const t = INGREDIENT_TIER[ing];
        return t === 'rare' || t === 'ultra_rare';
    });
    return promoted ? RecipeCards.rare : RecipeCards.common;
}

// Monaco's charset is 0x20–0x25 + 0x27–0x7d, so '&' (0x26) renders as tofu.
// Splice in a 04b03 segment for that single glyph, with a size bump so the
// pixel font reads at roughly the same cap-height as Monaco around it.
function renderMonacoTitle(text: string, baseFontSize: number) {
    if (!text.includes('&')) return text;
    const parts = text.split(/(&)/g);
    const fallbackSize = Math.round(baseFontSize * 0.7);
    return parts.map((part, i) =>
        part === '&' ? (
            <Text
                key={i}
                style={{ fontFamily: '04b03', fontSize: fallbackSize }}
            >
                {part}
            </Text>
        ) : (
            part
        ),
    );
}

const TIER_COLOR: Record<IngredientTier, string> = {
    common: '#cfd8c4',
    uncommon: '#7ecf7a',
    rare: '#6aaaff',
    ultra_rare: '#d6a2ff',
};

// Client-side mirrors of server formulas — exact same constants, used only
// for UI preview. The server re-derives on every cook, so any drift just
// shows a stale hint, not a scoring bug.
const RECIPE_LEVEL_STEP = 3;
const TIER_POINTS: Record<IngredientTier, number> = {
    common: 1,
    uncommon: 2,
    rare: 3,
    ultra_rare: 5,
};
function recipeBasePoints(recipe: Recipe): number {
    let sum = 0;
    for (const ing of recipe.ingredients) sum += TIER_POINTS[INGREDIENT_TIER[ing]] || 0;
    return sum * 10;
}
function levelFromProgress(progress: number): number {
    return 1 + Math.floor((progress || 0) / RECIPE_LEVEL_STEP);
}

interface Props {
    onBack: () => void;
    onNotification?: (
        message: string,
        type: 'success' | 'error' | 'info' | 'warning'
    ) => void;
}

// Check whether the pantry holds at least the multiset the recipe asks for.
function canAfford(recipe: Recipe, inventory: IngredientCounts): boolean {
    const needed: Record<string, number> = {};
    for (const ing of recipe.ingredients) {
        needed[ing] = (needed[ing] || 0) + 1;
    }
    for (const [ing, n] of Object.entries(needed)) {
        if ((inventory[ing] || 0) < n) return false;
    }
    return true;
}

// Twin of server's currentWindowName() — used only for UX hinting. The server
// re-derives this from its own clock on every cook, so an off-by-an-hour
// device clock can't actually let the user cook twice.
type MealWindow = 'breakfast' | 'lunch' | 'dinner';
function currentMealWindow(now = new Date()): MealWindow {
    const hour = now.getHours();
    if (hour >= 6 && hour < 12) return 'breakfast';
    if (hour >= 12 && hour < 18) return 'lunch';
    return 'dinner';
}

const FeedingPage = ({ onBack, onNotification }: Props) => {
    const {
        state,
        inventory,
        discoveredRecipes,
        recipeProgress,
        cookManual,
        cookRecipe,
    } = useGameStateContext();
    const insets = useSafeAreaInsets();
    const screenWidth = Dimensions.get('window').width;
    // Top banner is 1200×807, bottom strip is 1200×284 — height scales with
    // screen width since the overlays render full-bleed (width:'100%') and
    // resizeMode:contain. Matches Shop's reserve calc so all menu screens
    // share the same banner-anchored layout grid.
    const bannerReserve = screenWidth * (807 / 1200);
    const bottomBarReserve = screenWidth * (284 / 1200);

    const [manualOpen, setManualOpen] = useState(false);
    const [pendingRecipeId, setPendingRecipeId] = useState<string | null>(null);
    const [pendingManual, setPendingManual] = useState(false);
    const [lastResult, setLastResult] = useState<CookResponse['result'] | null>(null);

    // Hidden visual-QA toggle: 8 taps on MANUAL COOK within 800ms intervals
    // unlocks every recipe card on screen. Purely client-side — does not call
    // the discovery endpoint, just overrides the rendered list so we can
    // eyeball card art for recipes the user hasn't actually cooked yet.
    // Modal opens on a 220ms debounce so rapid tap salvos accrue without
    // popping the picker on the first hit.
    const [secretAllUnlocked, setSecretAllUnlocked] = useState(false);
    const secretTapCount = useRef(0);
    const secretLastTapAt = useRef(0);
    const manualOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const discoveredSet = useMemo(() => new Set(discoveredRecipes), [discoveredRecipes]);
    const discoveredRecipeDetails = useMemo(
        () => (secretAllUnlocked ? RECIPES : RECIPES.filter((r) => discoveredSet.has(r.id))),
        [discoveredSet, secretAllUnlocked]
    );

    const currentWindow = currentMealWindow();
    const alreadyClaimed = state?.mealBonusClaimed?.[currentWindow] === true;
    const windowLabel =
        currentWindow.charAt(0).toUpperCase() + currentWindow.slice(1);

    // Twin of server's moodMultiplier/hungerMultiplier (see cooking.js). Used
    // only for UI preview — the server re-derives from its own resolved state
    // on every cook, so any drift here just shows a stale hint, not a scoring
    // bug. Falls back to baseline (1.0 × 0.6) when state hasn't loaded yet.
    const mood = state?.mood ?? 0;
    const hunger = state?.hunger ?? 1;
    const moodMult = 1 + 0.1 * Math.max(0, Math.min(5, mood));
    const hungerMult = 0.5 + 0.1 * Math.max(0, Math.min(5, hunger));

    const notifyAlreadyClaimed = () => {
        onNotification?.(
            `${windowLabel} already cooked — wait for the next meal window`,
            'warning'
        );
    };

    // Tracks rapid taps on the MANUAL COOK card. Counter resets if the user
    // pauses longer than 800ms between taps, so accidental discovery is
    // unlikely. At 8 the visual-QA override flips on for the rest of the
    // session and we cancel any pending modal open so the salvo stays clean.
    const handleManualPress = () => {
        if (manualOpenTimer.current) {
            clearTimeout(manualOpenTimer.current);
            manualOpenTimer.current = null;
        }

        // Run the secret-tap counter before the alreadyClaimed gate so a QA
        // tap salvo still works after the user has cooked the current meal
        // window. Counter resets on a >800ms pause between taps.
        if (!secretAllUnlocked) {
            const now = Date.now();
            if (now - secretLastTapAt.current > 800) secretTapCount.current = 0;
            secretLastTapAt.current = now;
            secretTapCount.current += 1;
            if (secretTapCount.current >= 8) {
                secretTapCount.current = 0;
                setSecretAllUnlocked(true);
                onNotification?.('All recipe cards unlocked', 'info');
                return;
            }
        }

        if (alreadyClaimed) {
            notifyAlreadyClaimed();
            return;
        }

        // Defer the picker so a rapid 8-tap salvo can complete without the
        // modal stealing focus on tap #1.
        manualOpenTimer.current = setTimeout(() => {
            manualOpenTimer.current = null;
            setManualOpen(true);
        }, 220);
    };

    const handleCookRecipe = async (recipe: Recipe) => {
        if (pendingRecipeId || pendingManual) return;
        if (alreadyClaimed) {
            notifyAlreadyClaimed();
            return;
        }
        if (!canAfford(recipe, inventory)) {
            onNotification?.(`Not enough ingredients for ${recipe.name}`, 'warning');
            return;
        }
        setPendingRecipeId(recipe.id);
        try {
            const res = await cookRecipe(recipe.id);
            setLastResult(res.result);
            onNotification?.(`Cooked ${res.result.recipeName}`, 'success');
        } catch (e: any) {
            onNotification?.(e?.message || 'Cook failed', 'error');
        } finally {
            setPendingRecipeId(null);
        }
    };

    const handleManualCook = async (ingredients: IngredientId[]) => {
        setPendingManual(true);
        try {
            const res = await cookManual(ingredients);
            setLastResult(res.result);
            if (res.result.kind === 'slop') {
                onNotification?.('Cooked... slop. Still edible.', 'warning');
            } else if (res.result.firstDiscovery) {
                onNotification?.(`Discovered ${res.result.recipeName}!`, 'success');
            } else {
                onNotification?.(`Cooked ${res.result.recipeName}`, 'success');
            }
            setManualOpen(false);
        } catch (e: any) {
            onNotification?.(e?.message || 'Cook failed', 'error');
        } finally {
            setPendingManual(false);
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: '#1a1033' }}>
            <ImageBackground
                source={Backgrounds.cooking}
                style={styles.bg}
                resizeMode="cover"
                testID="feeding-screen"
            >
                <View
                    style={[
                        styles.scrollClipper,
                        { top: 0, bottom: 0 },
                    ]}
                >
                <ScrollView
                    contentContainerStyle={[
                        styles.scrollBody,
                        {
                            paddingTop: bannerReserve + insets.top + 8,
                            paddingBottom: bottomBarReserve + insets.bottom + 16,
                        },
                    ]}
                >
                    <TouchableOpacity
                        style={[styles.manualCard, alreadyClaimed && styles.cardDisabled]}
                        activeOpacity={alreadyClaimed ? 1 : 0.8}
                        onPress={handleManualPress}
                    >
                        <Text style={styles.manualTitle}>MANUAL COOK</Text>
                        <Text style={styles.manualSubtitle}>
                            {alreadyClaimed
                                ? `${windowLabel} already cooked — come back next window`
                                : 'Toss ingredients into the pot and see what happens'}
                        </Text>
                    </TouchableOpacity>

                    <Text style={styles.sectionHeading}>
                        RECIPE BOOK · {discoveredRecipeDetails.length}/{RECIPES.length}
                    </Text>

                    {discoveredRecipeDetails.length === 0 ? (
                        <Text style={styles.emptyText}>
                            No recipes yet. Cook manually to discover your first dish.
                        </Text>
                    ) : (
                        <View style={styles.recipeGrid}>
                            {discoveredRecipeDetails.map((recipe) => {
                                const affordable = canAfford(recipe, inventory);
                                const isPending = pendingRecipeId === recipe.id;
                                // Dev-reveal mode shows every card at full
                                // opacity for art QA — the affordability /
                                // claimed dim signals are noise when you're
                                // eyeballing card visuals. Tap behavior is
                                // unaffected (still uses hardDisabled below).
                                const visuallyDisabled =
                                    !secretAllUnlocked &&
                                    (!affordable || isPending || alreadyClaimed);
                                // Keep the card tappable when the only reason it's
                                // disabled is the claimed window, so we can pop the
                                // explanatory toast instead of silently eating the tap.
                                const hardDisabled =
                                    isPending || (!affordable && !alreadyClaimed);
                                const level = levelFromProgress(
                                    recipeProgress[recipe.id] || 0
                                );
                                const basePoints = recipeBasePoints(recipe);
                                // XP this recipe would pay out right now given
                                // current mood/hunger. Mirrors server formula:
                                //   basePoints × levelBonus × moodMult × hungerMult
                                // So the badge number moves with stats — a well-
                                // tended moonoko visibly pays more than a hungry
                                // one for the same dish.
                                const projectedXp = Math.max(
                                    0,
                                    Math.round(
                                        basePoints *
                                            (1 + 0.1 * (level - 1)) *
                                            moodMult *
                                            hungerMult
                                    )
                                );
                                // Collapse the ingredient list into a multiset so
                                // duplicates render as `[icon] ×N` instead of
                                // repeating icons (matches recipe-example.png).
                                const counts: Record<string, number> = {};
                                for (const ing of recipe.ingredients) {
                                    counts[ing] = (counts[ing] || 0) + 1;
                                }
                                const ingredientEntries = Object.entries(counts);
                                return (
                                    <TouchableOpacity
                                        key={recipe.id}
                                        style={[
                                            styles.recipeCard,
                                            visuallyDisabled && styles.cardDisabled,
                                            isPending && styles.cardPending,
                                        ]}
                                        activeOpacity={visuallyDisabled ? 1 : 0.7}
                                        onPress={() => {
                                            if (hardDisabled) return;
                                            if (alreadyClaimed) {
                                                notifyAlreadyClaimed();
                                                return;
                                            }
                                            handleCookRecipe(recipe);
                                        }}
                                        disabled={hardDisabled}
                                    >
                                        <ImageBackground
                                            source={recipeCardArt(recipe)}
                                            style={styles.cardArt}
                                            imageStyle={styles.cardArtImage}
                                            resizeMode="stretch"
                                        >
                                            {/* Title sits in the colored slot baked into
                                                the card art (upper-left). */}
                                            <Text
                                                style={styles.cardTitle}
                                                numberOfLines={1}
                                            >
                                                {renderMonacoTitle(recipe.name, 20)}
                                            </Text>
                                            <Image
                                                source={getRecipeArt(recipe.id)}
                                                style={styles.dishImage}
                                                resizeMode="contain"
                                            />
                                            {(() => {
                                                // 2-col mode for >3 unique ingredients: fill the
                                                // left column with the first 3 entries, rest spill
                                                // into a right column. So 4→3|1, 5→3|2, 6→3|3.
                                                const twoCol = ingredientEntries.length > 3;
                                                const leftEntries = twoCol
                                                    ? ingredientEntries.slice(0, 3)
                                                    : ingredientEntries;
                                                const rightEntries = twoCol
                                                    ? ingredientEntries.slice(3)
                                                    : [];
                                                const renderRow = ([ing, n]: [string, number]) => (
                                                    <View key={ing} style={styles.ingredientRow}>
                                                        <Image
                                                            source={getIngredientArt(ing)}
                                                            style={styles.ingredientIcon}
                                                            resizeMode="contain"
                                                        />
                                                        <Text style={styles.ingredientCount}>
                                                            ×{n}
                                                        </Text>
                                                    </View>
                                                );
                                                return (
                                                    <View
                                                        style={[
                                                            styles.ingredientList,
                                                            twoCol && styles.ingredientListTwoCol,
                                                        ]}
                                                    >
                                                        <View style={styles.ingredientCol}>
                                                            {leftEntries.map(renderRow)}
                                                        </View>
                                                        {twoCol && (
                                                            <View style={styles.ingredientCol}>
                                                                {rightEntries.map(renderRow)}
                                                            </View>
                                                        )}
                                                    </View>
                                                );
                                            })()}
                                            <Text style={styles.cardLevel}>
                                                Lv.{level}
                                            </Text>
                                            {/* Points number renders over the fire badge
                                                that's already painted into the card art. */}
                                            <Text style={styles.pointsOverFire}>
                                                {projectedXp}
                                            </Text>
                                        </ImageBackground>
                                        {!affordable && (
                                            <Text style={styles.recipeNote}>
                                                missing ingredients
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}

                    {lastResult && (
                        <View style={styles.lastResultCard}>
                            <Text style={styles.lastResultTitle}>
                                {lastResult.kind === 'recipe'
                                    ? `${lastResult.recipeName} · Lv.${lastResult.level}`
                                    : 'Slop'}
                            </Text>
                            <Text style={styles.lastResultLine}>
                                +{lastResult.hungerBoost} hunger · +{lastResult.moodBoost}{' '}
                                mood · +{lastResult.xp} pts
                            </Text>
                            <Text style={styles.lastResultBreakdown}>
                                base {lastResult.basePoints} × mood{' '}
                                {lastResult.moodMult.toFixed(2)} × hunger{' '}
                                {lastResult.hungerMult.toFixed(2)}
                            </Text>
                            {lastResult.firstDiscovery && (
                                <Text style={styles.lastResultDiscovery}>
                                    NEW RECIPE DISCOVERED
                                </Text>
                            )}
                        </View>
                    )}
                </ScrollView>
                </View>

                <View
                    pointerEvents="none"
                    style={[styles.bottomOverlay, { height: bottomBarReserve }]}
                >
                    <Image
                        source={Backgrounds.cookingBottom}
                        style={styles.overlayImage}
                        resizeMode="contain"
                    />
                </View>
                <View
                    pointerEvents="none"
                    style={[styles.bannerOverlay, { top: 0, height: bannerReserve }]}
                >
                    <Image
                        source={Backgrounds.cookingBanner}
                        style={styles.overlayImage}
                        resizeMode="contain"
                    />
                </View>

                <View
                    style={[
                        styles.bottomBar,
                        { height: bottomBarReserve, paddingBottom: insets.bottom },
                    ]}
                    pointerEvents="box-none"
                >
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={onBack}
                        hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                    >
                        <Text style={styles.backButtonText}>{'<'} Back</Text>
                    </TouchableOpacity>
                </View>

                <ManualCookModal
                    visible={manualOpen}
                    inventory={inventory}
                    submitting={pendingManual}
                    onDismiss={() => setManualOpen(false)}
                    onCook={handleManualCook}
                />
            </ImageBackground>
        </View>
    );
};

interface ManualCookModalProps {
    visible: boolean;
    inventory: IngredientCounts;
    submitting: boolean;
    onDismiss: () => void;
    onCook: (ingredients: IngredientId[]) => void;
}

// Picker overlay: tap ingredients to add one to the pot, tap the pot chip to
// remove one. Only ingredients the user actually holds are shown.
const ManualCookModal: React.FC<ManualCookModalProps> = ({
    visible,
    inventory,
    submitting,
    onDismiss,
    onCook,
}) => {
    const [pot, setPot] = useState<IngredientId[]>([]);

    const pantryEntries = useMemo(
        () =>
            Object.entries(inventory)
                .filter(([, n]) => n > 0)
                .sort(([a], [b]) => a.localeCompare(b)),
        [inventory]
    );

    const used = useMemo(() => {
        const m: Record<string, number> = {};
        for (const ing of pot) m[ing] = (m[ing] || 0) + 1;
        return m;
    }, [pot]);

    const addIngredient = (id: string) => {
        const owned = inventory[id] || 0;
        if ((used[id] || 0) >= owned) return;
        setPot((prev) => [...prev, id as IngredientId]);
    };

    const removeIngredient = (index: number) => {
        setPot((prev) => prev.filter((_, i) => i !== index));
    };

    const clear = () => setPot([]);

    const onSubmit = () => {
        if (pot.length === 0 || submitting) return;
        onCook(pot);
        setPot([]);
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
            <View style={modalStyles.backdrop}>
                <View style={modalStyles.sheet}>
                    <Text style={modalStyles.title}>MANUAL COOK</Text>

                    <Text style={modalStyles.section}>POT ({pot.length})</Text>
                    <View style={modalStyles.potRow}>
                        {pot.length === 0 ? (
                            <Text style={modalStyles.potEmpty}>Empty — tap pantry below</Text>
                        ) : (
                            pot.map((ing, i) => (
                                <TouchableOpacity
                                    key={`${ing}-${i}`}
                                    style={modalStyles.potChip}
                                    onPress={() => removeIngredient(i)}
                                >
                                    <Text style={modalStyles.potChipText}>
                                        {ingredientLabel(ing)} ×
                                    </Text>
                                </TouchableOpacity>
                            ))
                        )}
                    </View>

                    <Text style={modalStyles.section}>PANTRY</Text>
                    <ScrollView style={modalStyles.pantryScroll}>
                        {pantryEntries.length === 0 ? (
                            <Text style={modalStyles.potEmpty}>
                                No ingredients yet — forage some first
                            </Text>
                        ) : (
                            pantryEntries.map(([id, n]) => {
                                const remaining = (n as number) - (used[id] || 0);
                                return (
                                    <TouchableOpacity
                                        key={id}
                                        style={[
                                            modalStyles.pantryRow,
                                            remaining <= 0 && modalStyles.pantryRowSpent,
                                        ]}
                                        onPress={() => addIngredient(id)}
                                        disabled={remaining <= 0}
                                    >
                                        <Text style={modalStyles.pantryName}>
                                            {ingredientLabel(id)}
                                        </Text>
                                        <Text style={modalStyles.pantryCount}>
                                            {remaining}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </ScrollView>

                    <View style={modalStyles.actions}>
                        <TouchableOpacity style={modalStyles.cancel} onPress={onDismiss}>
                            <Text style={modalStyles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={modalStyles.clear}
                            onPress={clear}
                            disabled={pot.length === 0}
                        >
                            <Text style={modalStyles.clearText}>Clear</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                modalStyles.cook,
                                (pot.length === 0 || submitting) && modalStyles.cookDisabled,
                            ]}
                            onPress={onSubmit}
                            disabled={pot.length === 0 || submitting}
                        >
                            <Text style={modalStyles.cookText}>
                                {submitting ? 'COOKING...' : 'COOK'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    bg: { flex: 1, width: '100%', height: '100%' },
    // Bottom bar lives in the painted strip at the very bottom of the new
    // background. Absolute so the scroll content above isn't pushed by it —
    // scrollClipper already reserves the same height via marginBottom.
    bottomBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingHorizontal: 16,
    },
    backButton: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: 'rgba(46, 90, 62, 0.85)',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#E8F5E8',
    },
    backButtonText: {
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        fontSize: 10,
    },
    scrollClipper: {
        position: 'absolute',
        left: 0,
        right: 0,
        overflow: 'hidden',
    },
    bannerOverlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 1,
    },
    bottomOverlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1,
    },
    overlayImage: {
        width: '100%',
        height: '100%',
    },
    scrollBody: {
        paddingHorizontal: 16,
    },
    manualCard: {
        backgroundColor: 'rgba(46, 90, 62, 0.85)',
        borderWidth: 2,
        borderColor: '#E8B84A',
        borderRadius: 8,
        padding: 14,
        marginBottom: 18,
        alignItems: 'center',
    },
    manualTitle: {
        color: '#FFD700',
        fontFamily: 'PressStart2P',
        fontSize: 12,
        marginBottom: 4,
    },
    manualSubtitle: {
        color: '#E8F5E8',
        fontSize: 10,
        textAlign: 'center',
    },
    sectionHeading: {
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        fontSize: 10,
        marginBottom: 8,
    },
    emptyText: {
        color: '#E8F5E8',
        fontSize: 11,
        fontStyle: 'italic',
        textAlign: 'center',
        opacity: 0.8,
        marginVertical: 16,
    },
    recipeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    // Cards are now image-driven — chrome (header bar, points-fire badge) is
    // baked into the menu-card-COMMON/RARE PNGs. The card art is ~1.55:1
    // (source 1304×840), so aspectRatio locks the layout to the art's
    // proportions across screen widths.
    recipeCard: {
        marginBottom: 10,
        width: '48%',
    },
    cardArt: {
        aspectRatio: 1304 / 840,
        padding: 0,
    },
    cardArtImage: {
        // PNGs already have rounded corners + drop shadow baked in; let them
        // render edge-to-edge without RN clipping the shadow halo.
        borderRadius: 0,
    },
    // Title sits white in the upper-left painted band; level rides just
    // below it in the smaller tab beneath the title slot.
    cardTitle: {
        position: 'absolute',
        top: '3%',
        left: '7%',
        maxWidth: '88%',
        color: '#ffffff',
        fontFamily: 'Monaco',
        fontSize: 20,
        letterSpacing: 0.5,
        textShadowColor: '#2d1b69',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    // Level rides in the small teal tab on the left, just below the title
    // banner. Sized larger than the title to read as the recipe's "stamp".
    cardLevel: {
        position: 'absolute',
        top: '23%',
        left: '5%',
        color: '#ffffff',
        fontFamily: 'Monaco',
        fontSize: 20,
        textShadowColor: '#2d1b69',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    // Dish art sits below the level tab so the two never collide. Slightly
    // smaller than full-width to leave room for ingredients on the right.
    dishImage: {
        position: 'absolute',
        top: '40%',
        left: '8%',
        width: '42%',
        height: '52%',
    },
    // Ingredient column hugs the right edge starting near the top so it has
    // breathing room above the bottom-right fire badge.
    ingredientList: {
        position: 'absolute',
        top: '20%',
        right: '4%',
        bottom: '32%',
        width: '35%',
        alignItems: 'flex-end',
        justifyContent: 'flex-start',
    },
    // 2-col mode kicks in for >3 unique ingredients. Left col holds the first
    // 3 entries, right col holds the rest (so 4→3|1, 5→3|2, 6→3|3). Widen the
    // container so two columns of icon+×N actually fit side by side.
    ingredientListTwoCol: {
        width: '52%',
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
    },
    ingredientCol: {
        alignItems: 'flex-end',
        marginLeft: 6,
    },
    ingredientRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 2,
    },
    ingredientIcon: {
        width: 15,
        height: 15,
        marginRight: 5,
    },
    ingredientCount: {
        color: '#2d1b69',
        fontFamily: '04b03',
        fontSize: 13,
    },
    // Sits over the fire icon already baked into the bottom-right of the
    // card art. The fire reads as the "points" symbol; this is just the
    // number painted on top of it.
    pointsOverFire: {
        position: 'absolute',
        bottom: '11%',
        right: '12%',
        minWidth: '14%',
        textAlign: 'center',
        color: '#ffffff',
        fontFamily: 'Monaco',
        fontSize: 23,
        textShadowColor: '#2d1b69',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    recipeNote: {
        color: '#c14a4a',
        fontFamily: '04b03',
        fontSize: 11,
        paddingHorizontal: 6,
        paddingBottom: 4,
        textAlign: 'center',
    },
    cardDisabled: { filter: [{ grayscale: 1 }] },
    cardPending: { borderColor: '#E8B84A' },
    lastResultCard: {
        backgroundColor: 'rgba(24, 46, 32, 0.85)',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#8dd68d',
        padding: 10,
        marginTop: 14,
    },
    lastResultTitle: {
        color: '#FFD700',
        fontFamily: 'PressStart2P',
        fontSize: 10,
        marginBottom: 4,
    },
    lastResultLine: { color: '#E8F5E8', fontSize: 10 },
    lastResultBreakdown: {
        color: '#E8F5E8',
        fontSize: 9,
        opacity: 0.75,
        marginTop: 2,
    },
    lastResultDiscovery: {
        color: '#8dd68d',
        fontFamily: 'PressStart2P',
        fontSize: 9,
        marginTop: 6,
    },
});

const modalStyles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'center',
        padding: 18,
    },
    sheet: {
        backgroundColor: '#1a1f36',
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#E8B84A',
        padding: 14,
        maxHeight: '85%',
    },
    title: {
        color: '#FFD700',
        fontFamily: 'PressStart2P',
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 12,
    },
    section: {
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        fontSize: 9,
        marginTop: 6,
        marginBottom: 6,
    },
    potRow: {
        minHeight: 40,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        paddingVertical: 4,
    },
    potEmpty: {
        color: '#E8F5E8',
        fontSize: 10,
        opacity: 0.7,
        fontStyle: 'italic',
        paddingVertical: 6,
    },
    potChip: {
        backgroundColor: 'rgba(232, 184, 74, 0.25)',
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginRight: 6,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: '#E8B84A',
    },
    potChipText: { color: '#FFD700', fontSize: 10 },
    pantryScroll: { maxHeight: 220 },
    pantryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(232, 245, 232, 0.15)',
    },
    pantryRowSpent: { opacity: 0.4 },
    pantryName: { color: '#E8F5E8', fontSize: 11 },
    pantryCount: {
        color: '#FFD700',
        fontFamily: 'PressStart2P',
        fontSize: 10,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 14,
    },
    cancel: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(232, 122, 122, 0.2)',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#e87a7a',
    },
    cancelText: {
        color: '#e87a7a',
        fontFamily: 'PressStart2P',
        fontSize: 9,
    },
    clear: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(232, 245, 232, 0.15)',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(232, 245, 232, 0.6)',
    },
    clearText: {
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        fontSize: 9,
    },
    cook: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: '#E8B84A',
        borderRadius: 6,
    },
    cookDisabled: { opacity: 0.4 },
    cookText: { color: '#1a1033', fontFamily: 'PressStart2P', fontSize: 10 },
});

export default FeedingPage;
