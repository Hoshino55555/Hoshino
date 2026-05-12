import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ImageBackground,
    ScrollView,
    Modal,
    Image,
    Pressable,
    Animated,
    Easing,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FooterBackBar from '../chrome/FooterBackBar';
import PageArtShell from '../chrome/PageArtShell';
import { useGameStateContext } from '../../contexts/GameStateContext';
import {
    RECIPES,
    INGREDIENT_TIER,
    type Recipe,
    type IngredientId,
    type IngredientTier,
} from '../../services/RecipeCatalog';
import type { CookResponse, IngredientCounts } from '../../services/GameStateService';
import { Backgrounds, Cooking, getIngredientArt, getRecipeArt, RecipeCards, Frames } from '../../assets';
import { colors, fonts } from '../../styles/tokens';
import { scrollClipperFill } from '../../styles/primitives';

// Tier rule for the recipe-card background art: any rare/ultra_rare ingredient
// promotes to RARE (rainbow), any uncommon promotes to INTERMEDIATE (yellow),
// otherwise COMMON (mint). Lives here (not in the asset module) so the catalog
// stays art-agnostic and the rule can shift without re-touching assets/index.
function recipeCardArt(recipe: Recipe) {
    let highest: IngredientTier = 'common';
    for (const ing of recipe.ingredients) {
        const t = INGREDIENT_TIER[ing];
        if (t === 'rare' || t === 'ultra_rare') return RecipeCards.rare;
        if (t === 'uncommon') highest = 'uncommon';
    }
    return highest === 'uncommon' ? RecipeCards.intermediate : RecipeCards.common;
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
                style={{ fontFamily: fonts.pixelAlt, fontSize: fallbackSize }}
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

interface RecipeCardProps {
    recipe: Recipe;
    affordable: boolean;
    isPending: boolean;
    alreadyClaimed: boolean;
    level: number;
    projectedXp: number;
    onPress: (recipe: Recipe) => void;
}

const RecipeCard = React.memo<RecipeCardProps>(({
    recipe,
    affordable,
    isPending,
    alreadyClaimed,
    level,
    projectedXp,
    onPress,
}) => {
    const visuallyDisabled = !affordable || isPending || alreadyClaimed;
    // Keep the card tappable when the only reason it's disabled is the claimed
    // window, so we can pop the explanatory toast instead of silently eating the tap.
    const hardDisabled = isPending || (!affordable && !alreadyClaimed);

    // Collapse the ingredient list into a multiset so duplicates render as
    // `[icon] ×N` instead of repeating icons (matches recipe-example.png).
    const ingredientEntries = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const ing of recipe.ingredients) {
            counts[ing] = (counts[ing] || 0) + 1;
        }
        return Object.entries(counts);
    }, [recipe.ingredients]);

    const handlePress = useCallback(() => onPress(recipe), [onPress, recipe]);

    const twoCol = ingredientEntries.length > 3;
    const leftEntries = twoCol ? ingredientEntries.slice(0, 3) : ingredientEntries;
    const rightEntries = twoCol ? ingredientEntries.slice(3) : [];

    return (
        <Pressable
            style={({ pressed }) => [
                styles.recipeCard,
                visuallyDisabled && styles.cardDisabled,
                isPending && styles.cardPending,
                // Press feedback: shrink slightly instead of fading. Skip when
                // the card is locked/pending so a hard-disabled tap doesn't
                // fake an interactive bounce.
                pressed && !visuallyDisabled && { transform: [{ scale: 0.96 }] },
            ]}
            onPress={handlePress}
            disabled={hardDisabled}
        >
            <View style={styles.cardShadow} />
            <ImageBackground
                source={recipeCardArt(recipe)}
                style={styles.cardArt}
                imageStyle={styles.cardArtImage}
                resizeMode="stretch"
            >
                {/* Title sits in the colored slot baked into the card art (upper-left). */}
                <Text style={styles.cardTitle} numberOfLines={1}>
                    {renderMonacoTitle(recipe.name, 20)}
                </Text>
                <Image
                    source={getRecipeArt(recipe.id)}
                    style={styles.dishImage}
                    resizeMode="contain"
                />
                <View
                    style={[
                        styles.ingredientList,
                        twoCol && styles.ingredientListTwoCol,
                    ]}
                >
                    <View style={styles.ingredientCol}>
                        {leftEntries.map(([ing, n]) => (
                            <View key={ing} style={styles.ingredientRow}>
                                <Image
                                    source={getIngredientArt(ing)}
                                    style={styles.ingredientIcon}
                                    resizeMode="contain"
                                />
                                <Text style={styles.ingredientCount}>×{n}</Text>
                            </View>
                        ))}
                    </View>
                    {twoCol && (
                        <View style={styles.ingredientCol}>
                            {rightEntries.map(([ing, n]) => (
                                <View key={ing} style={styles.ingredientRow}>
                                    <Image
                                        source={getIngredientArt(ing)}
                                        style={styles.ingredientIcon}
                                        resizeMode="contain"
                                    />
                                    <Text style={styles.ingredientCount}>×{n}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
                <Text style={styles.cardLevel}>Lv.{level}</Text>
                {/* Points number renders over the fire badge that's already
                    painted into the card art. */}
                <Text style={styles.pointsOverFire}>{projectedXp}</Text>
            </ImageBackground>
        </Pressable>
    );
});
RecipeCard.displayName = 'RecipeCard';

const FeedingPage = ({ onBack, onNotification }: Props) => {
    const {
        state,
        inventory,
        discoveredRecipes,
        recipeProgress,
        cookManual,
        cookRecipe,
        devResetMealClaims,
        unlockAllRecipes,
    } = useGameStateContext();
    const insets = useSafeAreaInsets();
    const { width: screenWidth } = useWindowDimensions();
    // Top banner is 1200×807, bottom strip is 1200×284 — height scales with
    // screen width since the overlays render full-bleed (width:'100%') and
    // resizeMode:contain. Matches Shop's reserve calc so all menu screens
    // share the same banner-anchored layout grid.
    const bannerReserve = screenWidth * (807 / 1200);
    const bottomBarReserve = screenWidth * (284 / 1200);
    const contentTopPadding = bannerReserve * 0.97 + insets.top;
    const contentBottomPadding =
        bottomBarReserve * 1.17 + insets.bottom;

    const [manualOpen, setManualOpen] = useState(false);
    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
    const [pendingManual, setPendingManual] = useState(false);
    const [lastResult, setLastResult] = useState<CookResponse['result'] | null>(null);

    useEffect(() => {
        if (!lastResult) return;
        const timer = setTimeout(() => setLastResult(null), 5000);
        return () => clearTimeout(timer);
    }, [lastResult]);

    // Power-user shortcut: 4 taps on MANUAL COOK within 800ms intervals calls
    // the server to mark every catalog recipe as discovered. Persists in the
    // user's cooking doc, so recipes stay unlocked across page changes and
    // app reloads. Modal opens on a 220ms debounce so rapid tap salvos
    // accrue without popping the picker on the first hit.
    const secretTapCount = useRef(0);
    const secretLastTapAt = useRef(0);
    const unlockInFlight = useRef(false);
    const manualOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Two-tap detector for the dev star tap zone — debounces against
    // accidental brushes and gives the second tap a punchline.
    const obesityTapCount = useRef(0);
    const obesityLastTapAt = useRef(0);

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

    const notifyAlreadyClaimed = useCallback(() => {
        onNotification?.(
            `${windowLabel} already cooked — wait for the next meal window`,
            'warning'
        );
    }, [windowLabel, onNotification]);

    // Tracks rapid taps on the MANUAL COOK card. Counter resets if the user
    // pauses longer than 800ms between taps, so accidental discovery is
    // unlikely. At 4 we call the server to mark every recipe as discovered —
    // persistent across reloads — and cancel any pending modal open so the
    // salvo stays clean.
    const handleManualPress = useCallback(() => {
        if (manualOpenTimer.current) {
            clearTimeout(manualOpenTimer.current);
            manualOpenTimer.current = null;
        }

        // Run the secret-tap counter before the alreadyClaimed gate so the
        // unlock salvo still works after the user has cooked the current
        // meal window. Counter resets on a >800ms pause between taps. Skip
        // counting once every recipe is already discovered.
        const allAlreadyDiscovered = discoveredSet.size >= RECIPES.length;
        if (!allAlreadyDiscovered) {
            const now = Date.now();
            if (now - secretLastTapAt.current > 800) secretTapCount.current = 0;
            secretLastTapAt.current = now;
            secretTapCount.current += 1;
            if (secretTapCount.current >= 4) {
                secretTapCount.current = 0;
                if (!unlockInFlight.current) {
                    unlockInFlight.current = true;
                    unlockAllRecipes()
                        .then(() => {
                            onNotification?.('All recipes unlocked', 'info');
                        })
                        .catch((e: any) => {
                            onNotification?.(
                                e?.message || 'Failed to unlock recipes',
                                'error'
                            );
                        })
                        .finally(() => {
                            unlockInFlight.current = false;
                        });
                }
                return;
            }
        }

        if (alreadyClaimed) {
            notifyAlreadyClaimed();
            return;
        }

        // Defer the picker so a rapid 4-tap salvo can complete without the
        // modal stealing focus on tap #1.
        manualOpenTimer.current = setTimeout(() => {
            manualOpenTimer.current = null;
            setManualOpen(true);
        }, 220);
    }, [discoveredSet, alreadyClaimed, notifyAlreadyClaimed, onNotification, unlockAllRecipes]);

    const handleCookRecipe = useCallback((recipe: Recipe) => {
        if (pendingManual) return;
        if (alreadyClaimed) {
            notifyAlreadyClaimed();
            return;
        }
        if (!canAfford(recipe, inventory)) {
            onNotification?.(`Not enough ingredients for ${recipe.name}`, 'warning');
            return;
        }
        setSelectedRecipe(recipe);
        setManualOpen(true);
    }, [pendingManual, alreadyClaimed, notifyAlreadyClaimed, inventory, onNotification]);

    const dismissCookModal = useCallback(() => {
        setManualOpen(false);
        setSelectedRecipe(null);
    }, []);

    const handleManualCook = useCallback(async (ingredients: IngredientId[]) => {
        setPendingManual(true);
        try {
            const res = selectedRecipe
                ? await cookRecipe(selectedRecipe.id, ingredients)
                : await cookManual(ingredients);
            setLastResult(res.result);
            setManualOpen(false);
            setSelectedRecipe(null);
        } catch (e: any) {
            onNotification?.(e?.message || 'Cook failed', 'error');
        } finally {
            setPendingManual(false);
        }
    }, [selectedRecipe, cookRecipe, cookManual, onNotification]);

    // PageArtShell + ScrollView are both memoized — passing fresh array
    // references each render busts both memos.
    const shellOverlays = useMemo(
        () => [
            { key: 'bottom', source: Backgrounds.cookingBottom, edge: 'bottom' as const, height: bottomBarReserve },
            { key: 'banner', source: Backgrounds.cookingBanner, edge: 'top' as const, height: bannerReserve },
        ],
        [bottomBarReserve, bannerReserve],
    );
    const scrollContentStyle = useMemo(
        () => [styles.scrollBody, { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding }],
        [contentTopPadding, contentBottomPadding],
    );

    return (
        <PageArtShell
            background={Backgrounds.cooking}
            backgroundColor={colors.purpleBg}
            testID="feeding-screen"
            overlays={shellOverlays}
        >
                <View style={scrollClipperFill}>
                <ScrollView
                    contentContainerStyle={scrollContentStyle}
                >
                    <Pressable
                        style={({ pressed }) => [
                            styles.manualButton,
                            alreadyClaimed && styles.cardDisabled,
                            pressed && !alreadyClaimed && { transform: [{ scale: 0.96 }] },
                        ]}
                        onPress={handleManualPress}
                        disabled={alreadyClaimed}
                    >
                        <ImageBackground
                            source={Cooking.manualCookButton}
                            style={styles.manualButtonImage}
                            resizeMode="contain"
                        >
                            <Text style={styles.manualTitle}>
                                MANUAL<Text style={styles.manualTitleSpace}> </Text>COOK
                            </Text>
                            <Text style={styles.manualSubtitle} numberOfLines={1}>
                                {alreadyClaimed
                                    ? `${windowLabel} already cooked - come back next window`
                                    : 'Toss ingredients into the pot and see what happens'}
                            </Text>
                        </ImageBackground>
                    </Pressable>

                    {discoveredRecipeDetails.length > 0 && (
                        <View style={styles.recipeGrid}>
                            {discoveredRecipeDetails.map((recipe) => {
                                const affordable = canAfford(recipe, inventory);
                                const isPending = pendingManual && selectedRecipe?.id === recipe.id;
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
                                return (
                                    <RecipeCard
                                        key={recipe.id}
                                        recipe={recipe}
                                        affordable={affordable}
                                        isPending={isPending}
                                        alreadyClaimed={alreadyClaimed}
                                        level={level}
                                        projectedXp={projectedXp}
                                        onPress={handleCookRecipe}
                                    />
                                );
                            })}
                        </View>
                    )}

                </ScrollView>
                </View>

                {lastResult && (
                    <View
                        style={styles.lastResultOverlay}
                        pointerEvents="none"
                    >
                        <ImageBackground
                            source={Cooking.levelPopup}
                            style={styles.lastResultCard}
                            resizeMode="stretch"
                        >
                            <Text style={styles.lastResultTitle} numberOfLines={1}>
                                {lastResult.kind === 'recipe'
                                    ? `${lastResult.recipeName} · Lv.${lastResult.level}`
                                    : 'Slop'}
                            </Text>
                            <Text style={styles.lastResultLine} numberOfLines={1}>
                                +{lastResult.hungerBoost} hunger · +{lastResult.moodBoost}{' '}
                                mood · +{lastResult.xp} pts
                            </Text>
                            {lastResult.firstDiscovery && (
                                <Text style={styles.lastResultDiscovery} numberOfLines={1}>
                                    NEW RECIPE DISCOVERED
                                </Text>
                            )}
                        </ImageBackground>
                    </View>
                )}

                {/* Dev-only: tap the star painted into the banner art to
                    clear all meal-window claim flags so the feed flow can
                    be retested without waiting for the next game-day
                    rollover. Position is a guess against the banner art —
                    tweak the % values if it doesn't sit on the star. */}
                {__DEV__ && (() => {
                    const zoneW = screenWidth * 0.45;
                    const zoneH = bannerReserve * 0.30;
                    return (
                        <Pressable
                            onPress={() => {
                                const now = Date.now();
                                if (now - obesityLastTapAt.current > 1500) {
                                    obesityTapCount.current = 0;
                                }
                                obesityLastTapAt.current = now;
                                obesityTapCount.current += 1;
                                if (obesityTapCount.current >= 2) {
                                    obesityTapCount.current = 0;
                                    devResetMealClaims()
                                        .then(() =>
                                            onNotification?.(
                                                '🍔 OBESITY MODE ACTIVATED',
                                                'success'
                                            )
                                        )
                                        .catch((e: any) =>
                                            onNotification?.(
                                                e?.message || 'Reset failed',
                                                'error'
                                            )
                                        );
                                }
                            }}
                            style={{
                                position: 'absolute',
                                top: insets.top + bannerReserve * 0.32,
                                left: (screenWidth - zoneW) / 2,
                                width: zoneW,
                                height: zoneH,
                                zIndex: 5,
                            }}
                            hitSlop={8}
                        />
                    );
                })()}

                <FooterBackBar
                    onBack={onBack}
                    height={bottomBarReserve}
                    bottomInset={insets.bottom}
                />

                <ManualCookModal
                    visible={manualOpen}
                    inventory={inventory}
                    submitting={pendingManual}
                    onDismiss={dismissCookModal}
                    onCook={handleManualCook}
                    recipe={selectedRecipe}
                />
        </PageArtShell>
    );
};

interface ManualCookModalProps {
    visible: boolean;
    inventory: IngredientCounts;
    submitting: boolean;
    onDismiss: () => void;
    onCook: (ingredients: IngredientId[]) => void;
    // When provided, the picker is restricted to this recipe's ingredients.
    // The pot opens pre-filled with the recipe's minimum and the user can
    // toss in MORE of the same ingredients (up to the pot cap) for a bulk
    // bonus on the cook. No extras outside the recipe are selectable.
    recipe?: Recipe | null;
}

// Picker overlay: tap an ingredient card to toss one into the pot (it arcs in,
// landing inside the cauldron at the top); tap the pot to remove the most
// recent ingredient. Only ingredients the user holds are shown.
//
// Card layout shows the ingredient sprite, name, and a `used/owned` count so
// the player can see at-a-glance how many they have left to commit.
const TOSS_FLIGHT_MS = 520;
const MAX_POT_INGREDIENTS = 15;

interface FlyingItem {
    key: string;
    id: string;
    fromX: number;
    fromY: number;
    progress: Animated.Value;
}

interface EjectingItem {
    key: string;
    id: string;
    fromX: number;
    fromY: number;
    dx: number;
    dy: number;
    progress: Animated.Value;
}

const ManualCookModal: React.FC<ManualCookModalProps> = ({
    visible,
    inventory,
    submitting,
    onDismiss,
    onCook,
    recipe,
}) => {
    const [pot, setPot] = useState<IngredientId[]>([]);
    const [flying, setFlying] = useState<FlyingItem[]>([]);
    const [ejecting, setEjecting] = useState<EjectingItem[]>([]);
    const flyKeyRef = useRef(0);
    const pendingByIdRef = useRef<Record<string, number>>({});
    const sheetRef = useRef<View>(null);
    const potRef = useRef<View>(null);
    const sheetLayoutRef = useRef<{ x: number; y: number } | null>(null);
    const potLayoutRef = useRef<{ cx: number; cy: number } | null>(null);

    // Recipe minimum-multiset (e.g. {egg: 1, potato: 1}). Empty in manual
    // mode. Used to seed the pot, gate cooking, and label the cards.
    const recipeMin = useMemo<Record<string, number>>(() => {
        if (!recipe) return {};
        const m: Record<string, number> = {};
        for (const ing of recipe.ingredients) {
            m[ing] = (m[ing] || 0) + 1;
        }
        return m;
    }, [recipe]);

    const pantryEntries = useMemo(() => {
        const entries = Object.entries(inventory).filter(([, n]) => n > 0);
        // Recipe mode: pantry is restricted to recipe ingredients only.
        // Owned count is shown but the user cannot select unrelated items.
        const filtered = recipe
            ? entries.filter(([id]) => id in recipeMin)
            : entries;
        // In recipe mode, surface all recipe ingredients (even ones the
        // player doesn't own yet) so they can see what's missing.
        if (recipe) {
            const ownedIds = new Set(filtered.map(([id]) => id));
            for (const id of Object.keys(recipeMin)) {
                if (!ownedIds.has(id)) filtered.push([id, 0]);
            }
        }
        return filtered.sort(([a], [b]) => a.localeCompare(b));
    }, [inventory, recipe, recipeMin]);

    const used = useMemo(() => {
        const m: Record<string, number> = {};
        for (const ing of pot) m[ing] = (m[ing] || 0) + 1;
        return m;
    }, [pot]);

    // Reset internal state when the modal closes so re-opening is clean.
    // In recipe mode, opening seeds the pot with the recipe's minimum so the
    // user only has to add EXTRAS — the base recipe is already in.
    useEffect(() => {
        if (!visible) {
            setPot([]);
            setFlying([]);
            setEjecting([]);
            pendingByIdRef.current = {};
            sheetLayoutRef.current = null;
            potLayoutRef.current = null;
            return;
        }
        if (recipe) {
            const seeded: IngredientId[] = [];
            for (const ing of recipe.ingredients) {
                seeded.push(ing as IngredientId);
            }
            setPot(seeded);
        }
    }, [visible, recipe]);

    // Whether the pot satisfies the recipe minimum (recipe mode only).
    const minMet = useMemo(() => {
        if (!recipe) return true;
        const counts: Record<string, number> = {};
        for (const ing of pot) counts[ing] = (counts[ing] || 0) + 1;
        for (const [ing, n] of Object.entries(recipeMin)) {
            if ((counts[ing] || 0) < n) return false;
        }
        return true;
    }, [pot, recipe, recipeMin]);

    const measureSheet = () => {
        sheetRef.current?.measureInWindow((x, y) => {
            sheetLayoutRef.current = { x, y };
        });
    };

    const measurePot = () => {
        potRef.current?.measureInWindow((x, y, w, h) => {
            potLayoutRef.current = { cx: x + w / 2, cy: y + h / 2 };
        });
    };

    const addIngredient = (id: string, fromPageX: number, fromPageY: number) => {
        const owned = inventory[id] || 0;
        const pending = pendingByIdRef.current[id] || 0;
        // Pending toss animations count toward `used` so a fast double-tap
        // can't over-subscribe an ingredient before the first commit lands.
        if ((used[id] || 0) + pending >= owned) return;
        // Hard cap on pot capacity — pending counts toward the cap so the
        // 16th rapid tap is rejected even before the 15th has committed.
        const totalPending = Object.values(pendingByIdRef.current).reduce(
            (a, b) => a + b,
            0,
        );
        if (pot.length + totalPending >= MAX_POT_INGREDIENTS) return;
        pendingByIdRef.current[id] = pending + 1;

        const sheet = sheetLayoutRef.current;
        const potLayout = potLayoutRef.current;
        if (sheet && potLayout) {
            const fromX = fromPageX - sheet.x;
            const fromY = fromPageY - sheet.y;
            const progress = new Animated.Value(0);
            const key = `fly-${flyKeyRef.current++}`;
            setFlying((prev) => [...prev, { key, id, fromX, fromY, progress }]);
            Animated.timing(progress, {
                toValue: 1,
                duration: TOSS_FLIGHT_MS,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
            }).start(() => {
                setFlying((prev) => prev.filter((f) => f.key !== key));
            });
        }

        // The actual commit happens after the toss animation lands so the
        // count updates as the sprite drops into the pot.
        setTimeout(() => {
            pendingByIdRef.current[id] = Math.max(
                0,
                (pendingByIdRef.current[id] || 0) - 1,
            );
            setPot((prev) => [...prev, id as IngredientId]);
        }, sheet && potLayout ? TOSS_FLIGHT_MS - 40 : 0);
    };

    const popFromPot = () => {
        const last = pot[pot.length - 1];
        if (!last) return;
        setPot((prev) => prev.slice(0, -1));

        const sheet = sheetLayoutRef.current;
        const potLayout = potLayoutRef.current;
        if (!sheet || !potLayout) return;

        // Eject upward in a randomized arc — angle in [-60deg, 60deg] from
        // straight up so multiple pops in a row don't all fly the same way.
        const fromX = potLayout.cx - sheet.x;
        const fromY = potLayout.cy - sheet.y;
        const angle = (Math.random() - 0.5) * (Math.PI * 2 / 3);
        const distance = 110 + Math.random() * 40;
        const dx = Math.sin(angle) * distance;
        const dy = -Math.cos(angle) * distance;
        const progress = new Animated.Value(0);
        const key = `eject-${flyKeyRef.current++}`;
        setEjecting((prev) => [...prev, { key, id: last, fromX, fromY, dx, dy, progress }]);
        Animated.timing(progress, {
            toValue: 1,
            duration: TOSS_FLIGHT_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
        }).start(() => {
            setEjecting((prev) => prev.filter((e) => e.key !== key));
        });
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
                <View
                    ref={sheetRef}
                    style={modalStyles.sheet}
                    onLayout={measureSheet}
                >
                    {/* Painted background sits in its own clip layer so we
                        can shift the image up to hide cooking-bg-base.png's
                        transparent top strip without affecting the sheet's
                        overflow:visible (needed for the pot-toss animation
                        to arc out of the modal). */}
                    <View pointerEvents="none" style={modalStyles.sheetBgClip}>
                        <Image
                            source={Backgrounds.cooking}
                            style={[
                                modalStyles.sheetBgImage,
                                !recipe && modalStyles.sheetBgImageManual,
                            ]}
                            resizeMode="cover"
                        />
                    </View>
                    <Text style={modalStyles.title}>
                        {recipe ? recipe.name.toUpperCase() : 'MANUAL COOK'}
                    </Text>

                    <View style={modalStyles.potBay}>
                        <View
                            ref={potRef}
                            style={modalStyles.potWrap}
                            onLayout={measurePot}
                        >
                            <TouchableOpacity
                                activeOpacity={pot.length === 0 ? 1 : 0.85}
                                onPress={popFromPot}
                                disabled={pot.length === 0}
                            >
                                <Image
                                    source={Cooking.pot}
                                    style={modalStyles.potImage}
                                    resizeMode="contain"
                                />
                            </TouchableOpacity>
                            <View
                                style={[
                                    modalStyles.potCountBadge,
                                    pot.length >= MAX_POT_INGREDIENTS &&
                                        modalStyles.potCountBadgeFull,
                                ]}
                            >
                                <Text style={modalStyles.potCountText}>
                                    {pot.length}/{MAX_POT_INGREDIENTS}
                                </Text>
                            </View>
                        </View>
                        <Text style={modalStyles.potHint}>
                            {recipe && !minMet
                                ? 'Toss the rest of the recipe in'
                                : pot.length === 0
                                    ? 'Tap a card below to toss it in'
                                    : pot.length >= MAX_POT_INGREDIENTS
                                        ? 'Pot is full — cook or tap to remove'
                                        : recipe
                                            ? 'Add more for a bulk bonus'
                                            : 'Tap pot to remove last'}
                        </Text>
                    </View>

                    <Text style={modalStyles.section}>
                        {recipe ? 'INGREDIENTS' : 'PANTRY'}
                    </Text>
                    <ScrollView
                        style={modalStyles.pantryScroll}
                        contentContainerStyle={modalStyles.pantryGrid}
                    >
                        {pantryEntries.length === 0 ? (
                            <Text style={modalStyles.potEmpty}>
                                No ingredients yet — forage some first
                            </Text>
                        ) : (
                            pantryEntries.map(([id, n]) => {
                                const owned = n as number;
                                const usedCount = used[id] || 0;
                                const remaining = owned - usedCount;
                                const spent = remaining <= 0;
                                const minRequired = recipeMin[id] || 0;
                                const belowMin = recipe ? usedCount < minRequired : false;
                                return (
                                    <Pressable
                                        key={id}
                                        onPress={(e) =>
                                            addIngredient(
                                                id,
                                                e.nativeEvent.pageX,
                                                e.nativeEvent.pageY,
                                            )
                                        }
                                        disabled={spent}
                                        style={({ pressed }) => [
                                            modalStyles.ingredientCard,
                                            spent && modalStyles.ingredientCardSpent,
                                            pressed && !spent && {
                                                transform: [{ scale: 0.94 }],
                                            },
                                        ]}
                                    >
                                        <ImageBackground
                                            source={Frames.pantrySlot}
                                            style={modalStyles.ingredientCardInner}
                                            imageStyle={modalStyles.ingredientCardTile}
                                            resizeMode="cover"
                                        >
                                            {belowMin && (
                                                <View
                                                    pointerEvents="none"
                                                    style={modalStyles.ingredientCardBelowMin}
                                                />
                                            )}
                                            {minRequired > 0 && (
                                                <View style={modalStyles.minBadge}>
                                                    <Text style={modalStyles.minBadgeText}>
                                                        min {minRequired}
                                                    </Text>
                                                </View>
                                            )}
                                            <Image
                                                source={getIngredientArt(id)}
                                                style={modalStyles.ingredientCardIcon}
                                                resizeMode="contain"
                                            />
                                            <Text style={modalStyles.ingredientCardCount}>
                                                {usedCount}/{owned}
                                            </Text>
                                        </ImageBackground>
                                    </Pressable>
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
                                (pot.length === 0 || submitting || !minMet) &&
                                    modalStyles.cookDisabled,
                            ]}
                            onPress={onSubmit}
                            disabled={pot.length === 0 || submitting || !minMet}
                        >
                            <Text style={modalStyles.cookText}>
                                {submitting ? 'COOKING...' : 'COOK'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {flying.map((f) => {
                        const potLayout = potLayoutRef.current;
                        const sheet = sheetLayoutRef.current;
                        if (!potLayout || !sheet) return null;
                        const toX = potLayout.cx - sheet.x;
                        const toY = potLayout.cy - sheet.y;
                        const dx = toX - f.fromX;
                        const dy = toY - f.fromY;
                        const arcHeight = -Math.max(80, Math.abs(dy) * 0.6);
                        const translateX = f.progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, dx],
                        });
                        const translateY = Animated.add(
                            f.progress.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, dy],
                            }),
                            f.progress.interpolate({
                                inputRange: [0, 0.5, 1],
                                outputRange: [0, arcHeight, 0],
                            }),
                        );
                        const scale = f.progress.interpolate({
                            inputRange: [0, 0.85, 1],
                            outputRange: [1, 0.9, 0.5],
                        });
                        const opacity = f.progress.interpolate({
                            inputRange: [0, 0.85, 1],
                            outputRange: [1, 1, 0],
                        });
                        const rotate = f.progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '320deg'],
                        });
                        return (
                            <Animated.View
                                key={f.key}
                                pointerEvents="none"
                                style={[
                                    modalStyles.flyingItem,
                                    {
                                        left: f.fromX - 18,
                                        top: f.fromY - 18,
                                        opacity,
                                        transform: [
                                            { translateX },
                                            { translateY },
                                            { scale },
                                            { rotate },
                                        ],
                                    },
                                ]}
                            >
                                <Image
                                    source={getIngredientArt(f.id)}
                                    style={modalStyles.flyingItemImage}
                                    resizeMode="contain"
                                />
                            </Animated.View>
                        );
                    })}

                    {ejecting.map((e) => {
                        // Eject arc: pops up out of the pot along (dx, dy)
                        // with a small overshoot so it crests above the
                        // straight-line endpoint, then fades.
                        const arcOvershoot = Math.min(-30, e.dy * 0.3);
                        const translateX = e.progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, e.dx],
                        });
                        const translateY = Animated.add(
                            e.progress.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, e.dy],
                            }),
                            e.progress.interpolate({
                                inputRange: [0, 0.5, 1],
                                outputRange: [0, arcOvershoot, 0],
                            }),
                        );
                        const scale = e.progress.interpolate({
                            inputRange: [0, 0.6, 1],
                            outputRange: [1, 1, 0.6],
                        });
                        const opacity = e.progress.interpolate({
                            inputRange: [0, 0.6, 1],
                            outputRange: [1, 1, 0],
                        });
                        const rotate = e.progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '-280deg'],
                        });
                        return (
                            <Animated.View
                                key={e.key}
                                pointerEvents="none"
                                style={[
                                    modalStyles.flyingItem,
                                    {
                                        left: e.fromX - 18,
                                        top: e.fromY - 18,
                                        opacity,
                                        transform: [
                                            { translateX },
                                            { translateY },
                                            { scale },
                                            { rotate },
                                        ],
                                    },
                                ]}
                            >
                                <Image
                                    source={getIngredientArt(e.id)}
                                    style={modalStyles.flyingItemImage}
                                    resizeMode="contain"
                                />
                            </Animated.View>
                        );
                    })}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    scrollBody: {
        paddingHorizontal: 16,
    },
    manualButton: {
        width: '100%',
        aspectRatio: 980 / 175,
        marginBottom: 18,
    },
    manualButtonImage: {
        width: '100%',
        height: '100%',
    },
    manualTitle: {
        position: 'absolute',
        top: '19%',
        left: 0,
        right: 0,
        color: '#ffffff',
        fontFamily: fonts.pixel,
        fontSize: 12,
        textAlign: 'center',
    },
    manualTitleSpace: {
        fontSize: 6,
    },
    manualSubtitle: {
        position: 'absolute',
        top: '55%',
        left: 0,
        right: 0,
        color: colors.slotInk,
        fontFamily: fonts.body,
        fontSize: 18,
        textAlign: 'center',
    },
    sectionHeading: {
        color: colors.mintPale,
        fontFamily: fonts.pixel,
        fontSize: 10,
        marginBottom: 8,
    },
    emptyText: {
        color: colors.mintPale,
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
    cardShadow: {
        position: 'absolute',
        top: 10,
        left: '3%',
        right: '3%',
        bottom: '6%',
        backgroundColor: '#000',
        opacity: 0.25,
        borderRadius: 14,
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
        color: colors.white,
        fontFamily: fonts.body,
        fontSize: 20,
        letterSpacing: 0.5,
        textShadowColor: colors.purpleText,
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    // Level rides in the small teal tab on the left, just below the title
    // banner. Sized larger than the title to read as the recipe's "stamp".
    cardLevel: {
        position: 'absolute',
        top: '23%',
        left: '5%',
        color: colors.white,
        fontFamily: fonts.body,
        fontSize: 20,
        textShadowColor: colors.purpleText,
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
        top: '18%',
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
        color: colors.purpleText,
        fontFamily: fonts.pixelAlt,
        fontSize: 13,
        // 04b03's glyph baseline reads a hair low against the 15dp icon
        // even with flex-center; lift by 1px so the cap-height visually
        // matches the icon's vertical midpoint.
        transform: [{ translateY: -1 }],
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
        color: colors.white,
        fontFamily: fonts.body,
        fontSize: 24,
        textShadowColor: colors.purpleText,
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    cardDisabled: { filter: [{ grayscale: 1 }] },
    cardPending: { borderColor: colors.gold },
    lastResultOverlay: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 16,
        right: 16,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        elevation: 50,
    },
    lastResultCard: {
        width: '100%',
        aspectRatio: 1120 / 210,
        justifyContent: 'center',
    },
    lastResultTitle: {
        position: 'absolute',
        top: '15%',
        left: 0,
        right: 0,
        color: colors.white,
        fontFamily: fonts.pixel,
        fontSize: 11,
        textAlign: 'center',
    },
    lastResultLine: {
        position: 'absolute',
        top: '46%',
        left: 0,
        right: 0,
        color: colors.slotInk,
        fontFamily: fonts.body,
        fontSize: 18,
        textAlign: 'center',
    },
    lastResultDiscovery: {
        position: 'absolute',
        top: '70%',
        left: 0,
        right: 0,
        color: colors.purpleText,
        fontFamily: fonts.pixel,
        fontSize: 9,
        textAlign: 'center',
    },
});

const modalStyles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'center',
        padding: 8,
    },
    sheet: {
        // Backstop tint behind the painted background; shows if the image
        // ever fails to load (and keeps the painted edges from bleeding the
        // backdrop through the rounded corners during the fade-in frame).
        backgroundColor: colors.purpleBg,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: colors.gold,
        padding: 16,
        maxHeight: '100%',
        overflow: 'visible',
    },
    // Absolute clip layer for the painted cooking-bg-base. Hosts the image
    // under content; rounded + overflow:hidden so the image clips to the
    // sheet's corners even though the sheet itself stays overflow:visible
    // (the flying pot-toss arcs out of the sheet bounds).
    sheetBgClip: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 12,
        overflow: 'hidden',
    },
    // Cover-fill and bias the painted cooking backdrop upward so the source
    // image's transparent top strip clips out of the modal.
    sheetBgImage: {
        position: 'absolute',
        top: '-12%',
        left: 0,
        right: 0,
        width: '100%',
        height: '112%',
    },
    sheetBgImageManual: {
        top: '-52%',
        height: '168%',
    },
    title: {
        color: colors.goldBright,
        fontFamily: fonts.body,
        fontSize: 30,
        textAlign: 'center',
        marginBottom: 12,
    },
    section: {
        color: colors.mintPale,
        fontFamily: fonts.body,
        fontSize: 24,
        marginTop: 6,
        marginBottom: 12,
    },
    potBay: {
        alignItems: 'center',
        marginBottom: 8,
    },
    potWrap: {
        position: 'relative',
        width: 132,
        height: 132,
        alignItems: 'center',
        justifyContent: 'center',
    },
    potImage: {
        width: 132,
        height: 132,
    },
    potCountBadge: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        minWidth: 50,
        paddingHorizontal: 8,
        paddingVertical: 3,
        backgroundColor: colors.gold,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.purpleBg,
    },
    potCountBadgeFull: {
        backgroundColor: colors.error,
    },
    potCountText: {
        color: colors.purpleBg,
        fontFamily: fonts.body,
        fontSize: 20,
    },
    potHint: {
        color: colors.mintPale,
        fontFamily: fonts.body,
        fontSize: 16,
        opacity: 0.75,
        marginTop: 4,
    },
    potEmpty: {
        color: colors.mintPale,
        fontFamily: fonts.body,
        fontSize: 13,
        opacity: 0.7,
        fontStyle: 'italic',
        paddingVertical: 8,
        textAlign: 'center',
        width: '100%',
    },
    pantryScroll: { maxHeight: 280 },
    pantryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
        // Stop wrap-rows from cross-axis stretching to the tallest sibling —
        // otherwise aspectRatio gets overridden and the painted slot art
        // cover-crops top/bottom. Same pattern as the inventory grid.
        alignItems: 'flex-start'
    },
    // 4 cards per row: width 23% × 4 = 92% (8% headroom split as right margin
    // keeps Yoga's % rounding from wrapping a card to the next row). The box
    // matches the 320:360 slot PNG exactly so resizeMode="cover" has nothing
    // to crop.
    ingredientCard: {
        width: '25%',
        aspectRatio: 320 / 360,
    },
    // ImageBackground sizes its outer wrapper via `style` and the inner image
    // via `imageStyle`. Outer fills the Pressable; image fills the outer.
    // Symmetric padding so the icon centers visually with the painted slot
    // (the slot art is full-width with no horizontal drop-shadow bias).
    ingredientCardInner: {
        flex: 1,
        paddingTop: 4,
        paddingBottom: 4,
        paddingHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    ingredientCardTile: {
        width: '100%',
        height: '100%',
    },
    ingredientCardSpent: {
        opacity: 0.35,
    },
    ingredientCardBelowMin: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderWidth: 2,
        borderColor: colors.error,
        borderRadius: 8,
    },
    minBadge: {
        position: 'absolute',
        top: 2,
        left: 2,
        paddingHorizontal: 3,
        paddingVertical: 1,
        backgroundColor: colors.gold,
        borderRadius: 4,
        zIndex: 1,
    },
    minBadgeText: {
        color: colors.purpleBg,
        fontFamily: fonts.body,
        fontSize: 9,
    },
    // No name text on pantry tiles — the icon is distinctive enough at this
    // size, and at the painted slot's small footprint the name + count was
    // overlapping the mint panel. Icon sits in the upper area of the slot,
    // count owns the bottom mint panel.
    //
    // The slot art's bottom drop-shadow extends further on the bottom-left
    // than the right (light source from upper-right). That visual weight
    // makes geometrically-centered content read as slightly right-shifted.
    // 2dp leftward translate on the foreground elements re-centers the
    // perceived layout without touching the painted slot or the padding.
    ingredientCardIcon: {
        width: 34,
        height: 34,
        marginTop: 4,
        transform: [{ translateX: -2 }],
    },
    ingredientCardCount: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '24%',
        textAlign: 'center',
        color: colors.slotInk,
        fontFamily: fonts.body,
        fontSize: 22,
        transform: [{ translateX: -2 }],
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 14,
    },
    cancel: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: 'rgba(232, 122, 122, 0.2)',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.error,
    },
    cancelText: {
        color: colors.error,
        fontFamily: fonts.body,
        fontSize: 18,
    },
    clear: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: 'rgba(232, 245, 232, 0.15)',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(232, 245, 232, 0.6)',
    },
    clearText: {
        color: colors.mintPale,
        fontFamily: fonts.body,
        fontSize: 18,
    },
    cook: {
        paddingVertical: 10,
        paddingHorizontal: 18,
        backgroundColor: colors.gold,
        borderRadius: 6,
    },
    cookDisabled: { opacity: 0.4 },
    cookText: {
        color: colors.purpleBg,
        fontFamily: fonts.body,
        fontSize: 18,
    },
    flyingItem: {
        position: 'absolute',
        width: 36,
        height: 36,
    },
    flyingItemImage: {
        width: '100%',
        height: '100%',
    },
});

export default FeedingPage;
