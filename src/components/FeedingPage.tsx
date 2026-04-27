import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ImageBackground,
    ScrollView,
    Modal,
    Image,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ZoomOutOverlay from './ZoomOutOverlay';
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
import { Backgrounds, Ingredients, getIngredientArt } from '../assets';

// Per-recipe dish art hasn't been authored yet. Until it lands, each recipe
// picks one of the three celestial sprites via a hash of its id so the same
// recipe always shows the same placeholder. Ingredient slots use real art
// via `getIngredientArt`, which falls back to the same celestial pool.
const PLACEHOLDER_DISH_IMAGES = [
    Ingredients.miraBerry,
    Ingredients.novaEgg,
    Ingredients.pinkSugar,
];
function placeholderDishFor(id: string) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return PLACEHOLDER_DISH_IMAGES[Math.abs(h) % PLACEHOLDER_DISH_IMAGES.length];
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
    const { height: screenHeight } = useWindowDimensions();
    // Reserve the top ~33% of the screen so content lands just below the
    // painted "MENU" banner. Measured from the cooking-bg.png: scene + MENU
    // label occupy roughly the top third of a tall phone screen.
    const bannerReserve = screenHeight * 0.25;

    const [isClosing, setIsClosing] = useState(false);
    const [manualOpen, setManualOpen] = useState(false);
    const [pendingRecipeId, setPendingRecipeId] = useState<string | null>(null);
    const [pendingManual, setPendingManual] = useState(false);
    const [lastResult, setLastResult] = useState<CookResponse['result'] | null>(null);

    const discoveredSet = useMemo(() => new Set(discoveredRecipes), [discoveredRecipes]);
    const discoveredRecipeDetails = useMemo(
        () => RECIPES.filter((r) => discoveredSet.has(r.id)),
        [discoveredSet]
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

    const handleClose = () => {
        if (isClosing) return;
        setIsClosing(true);
    };

    const notifyAlreadyClaimed = () => {
        onNotification?.(
            `${windowLabel} already cooked — wait for the next meal window`,
            'warning'
        );
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
        <ZoomOutOverlay exiting={isClosing} onExitComplete={onBack} backgroundColor="#1a1033">
            <ImageBackground
                source={Backgrounds.cooking}
                style={styles.bg}
                resizeMode="cover"
            >
                <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={handleClose}
                        hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                    >
                        <Text style={styles.backButtonText}>{'<'} Back</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView
                    contentContainerStyle={[
                        styles.scrollBody,
                        { paddingTop: bannerReserve, paddingBottom: insets.bottom + 16 },
                    ]}
                >
                    <TouchableOpacity
                        style={[styles.manualCard, alreadyClaimed && styles.cardDisabled]}
                        activeOpacity={alreadyClaimed ? 1 : 0.8}
                        onPress={() =>
                            alreadyClaimed ? notifyAlreadyClaimed() : setManualOpen(true)
                        }
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
                                const visuallyDisabled =
                                    !affordable || isPending || alreadyClaimed;
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
                                        <View style={styles.cardHeader}>
                                            <Text
                                                style={styles.cardHeaderName}
                                                numberOfLines={1}
                                            >
                                                {recipe.name}
                                            </Text>
                                            <Text style={styles.cardHeaderLevel}>
                                                Lv.{level}
                                            </Text>
                                        </View>
                                        <View style={styles.cardBody}>
                                            <View style={styles.dishImageWrap}>
                                                <Image
                                                    source={placeholderDishFor(recipe.id)}
                                                    style={styles.dishImage}
                                                    resizeMode="contain"
                                                />
                                            </View>
                                            <View style={styles.ingredientCol}>
                                                <View style={styles.ingredientList}>
                                                    {ingredientEntries.map(([ing, n]) => (
                                                        <View
                                                            key={ing}
                                                            style={styles.ingredientRow}
                                                        >
                                                            <Image
                                                                source={getIngredientArt(ing)}
                                                                style={styles.ingredientIcon}
                                                                resizeMode="contain"
                                                            />
                                                            <Text style={styles.ingredientCount}>
                                                                ×{n}
                                                            </Text>
                                                        </View>
                                                    ))}
                                                </View>
                                                <View style={styles.pointsBadge}>
                                                    <View style={styles.pointsMarker} />
                                                    <Text style={styles.pointsBadgeText}>
                                                        {projectedXp}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
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

                <ManualCookModal
                    visible={manualOpen}
                    inventory={inventory}
                    submitting={pendingManual}
                    onDismiss={() => setManualOpen(false)}
                    onCook={handleManualCook}
                />
            </ImageBackground>
        </ZoomOutOverlay>
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
    topBar: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
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
    // Cards are intentionally sharp-cornered (borderRadius 0) with a chunky
    // dark border — gives the pixel-art feel of the recipe-example reference.
    // Inner lip uses a lighter border to get the two-tone "pressed" look.
    recipeCard: {
        backgroundColor: '#f5eed6',
        borderRadius: 0,
        borderWidth: 2,
        borderColor: '#3a2a1a',
        padding: 0,
        marginBottom: 10,
        width: '48%',
        overflow: 'hidden',
    },
    cardHeader: {
        backgroundColor: '#9ed5c5',
        paddingHorizontal: 6,
        paddingVertical: 4,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: '#3a2a1a',
    },
    cardHeaderName: {
        color: '#ffffff',
        fontFamily: 'PressStart2P',
        fontSize: 8,
        flexShrink: 1,
        paddingRight: 4,
        textShadowColor: '#3a2a1a',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    cardHeaderLevel: {
        color: '#ffffff',
        fontFamily: 'PressStart2P',
        fontSize: 8,
        textShadowColor: '#3a2a1a',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    cardBody: {
        flexDirection: 'row',
        padding: 8,
        minHeight: 90,
    },
    dishImageWrap: {
        flex: 1,
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dishImage: {
        width: '95%',
        height: '95%',
    },
    ingredientCol: {
        flex: 1,
        paddingLeft: 6,
        paddingRight: 8,
        justifyContent: 'space-between',
    },
    ingredientList: {
        alignItems: 'flex-end',
    },
    ingredientRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 2,
    },
    ingredientIcon: {
        width: 24,
        height: 24,
        marginRight: 4,
    },
    ingredientCount: {
        color: '#3a2a1a',
        fontFamily: 'PressStart2P',
        fontSize: 10,
    },
    pointsBadge: {
        alignSelf: 'flex-end',
        backgroundColor: '#9ed5c5',
        borderWidth: 2,
        borderColor: '#3a2a1a',
        borderRadius: 0,
        paddingHorizontal: 6,
        paddingVertical: 3,
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    pointsMarker: {
        width: 8,
        height: 10,
        backgroundColor: '#ef6d3a',
        borderWidth: 1,
        borderColor: '#3a2a1a',
        borderRadius: 0,
        marginRight: 4,
    },
    pointsBadgeText: {
        color: '#ffffff',
        fontFamily: 'PressStart2P',
        fontSize: 10,
        textShadowColor: '#3a2a1a',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    recipeNote: {
        color: '#c14a4a',
        fontFamily: 'PressStart2P',
        fontSize: 7,
        paddingHorizontal: 6,
        paddingBottom: 4,
        textAlign: 'center',
    },
    cardDisabled: { opacity: 0.5 },
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
