import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ImageBackground,
    ScrollView,
    Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ZoomOutOverlay from './ZoomOutOverlay';
import { useGameStateContext } from '../contexts/GameStateContext';
import {
    RECIPES,
    ingredientLabel,
    type Recipe,
    type IngredientId,
} from '../services/RecipeCatalog';
import type { CookResponse, IngredientCounts } from '../services/GameStateService';

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

const FeedingPage = ({ onBack, onNotification }: Props) => {
    const {
        state,
        inventory,
        discoveredRecipes,
        cookManual,
        cookRecipe,
    } = useGameStateContext();
    const insets = useSafeAreaInsets();

    const [isClosing, setIsClosing] = useState(false);
    const [manualOpen, setManualOpen] = useState(false);
    const [pendingRecipeId, setPendingRecipeId] = useState<string | null>(null);
    const [pendingManual, setPendingManual] = useState(false);
    const [lastResult, setLastResult] = useState<CookResponse['result'] | null>(null);

    const currentHunger = state?.hunger ?? 5;
    const full = currentHunger >= 5;

    const discoveredSet = useMemo(() => new Set(discoveredRecipes), [discoveredRecipes]);
    const discoveredRecipeDetails = useMemo(
        () => RECIPES.filter((r) => discoveredSet.has(r.id)),
        [discoveredSet]
    );

    const handleClose = () => {
        if (isClosing) return;
        setIsClosing(true);
    };

    const handleCookRecipe = async (recipe: Recipe) => {
        if (pendingRecipeId || pendingManual) return;
        if (full) {
            onNotification?.('Too full to cook', 'info');
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
                source={require('../../assets/images/cooking-bg.png')}
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
                    <Text style={styles.hungerText}>Hunger {currentHunger}/5</Text>
                </View>

                <ScrollView
                    contentContainerStyle={[
                        styles.scrollBody,
                        { paddingBottom: insets.bottom + 16 },
                    ]}
                >
                    <TouchableOpacity
                        style={[styles.manualCard, full && styles.cardDisabled]}
                        activeOpacity={0.8}
                        onPress={() => !full && setManualOpen(true)}
                        disabled={full}
                    >
                        <Text style={styles.manualTitle}>MANUAL COOK</Text>
                        <Text style={styles.manualSubtitle}>
                            Toss ingredients into the pot and see what happens
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
                        discoveredRecipeDetails.map((recipe) => {
                            const affordable = canAfford(recipe, inventory);
                            const isPending = pendingRecipeId === recipe.id;
                            const disabled = !affordable || full || isPending;
                            return (
                                <TouchableOpacity
                                    key={recipe.id}
                                    style={[
                                        styles.recipeCard,
                                        disabled && styles.cardDisabled,
                                        isPending && styles.cardPending,
                                    ]}
                                    activeOpacity={disabled ? 1 : 0.7}
                                    onPress={() => !disabled && handleCookRecipe(recipe)}
                                    disabled={disabled}
                                >
                                    <Text style={styles.recipeName}>{recipe.name}</Text>
                                    <Text style={styles.recipeIngredients}>
                                        {recipe.ingredients.map(ingredientLabel).join(' · ')}
                                    </Text>
                                    {!affordable && (
                                        <Text style={styles.recipeNote}>
                                            missing ingredients
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            );
                        })
                    )}

                    {lastResult && (
                        <View style={styles.lastResultCard}>
                            <Text style={styles.lastResultTitle}>
                                {lastResult.kind === 'recipe'
                                    ? lastResult.recipeName
                                    : 'Slop'}
                            </Text>
                            <Text style={styles.lastResultLine}>
                                +{lastResult.hungerBoost} hunger · +{lastResult.moodBoost}{' '}
                                mood · +{lastResult.xp} xp
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
    hungerText: {
        color: '#FFD700',
        fontFamily: 'PressStart2P',
        fontSize: 10,
    },
    scrollBody: {
        paddingHorizontal: 16,
        paddingTop: 8,
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
    recipeCard: {
        backgroundColor: 'rgba(28, 35, 55, 0.85)',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(232, 245, 232, 0.3)',
        padding: 10,
        marginBottom: 8,
    },
    recipeName: {
        color: '#FFD700',
        fontFamily: 'PressStart2P',
        fontSize: 10,
        marginBottom: 4,
    },
    recipeIngredients: {
        color: '#E8F5E8',
        fontSize: 10,
    },
    recipeNote: {
        color: '#e87a7a',
        fontSize: 9,
        marginTop: 4,
    },
    cardDisabled: { opacity: 0.45 },
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
