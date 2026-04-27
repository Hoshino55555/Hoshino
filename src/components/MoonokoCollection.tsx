import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import InnerScreen from './InnerScreen';
import { getCharacterStill } from '../assets';

const getImageSource = (imageName: string) => getCharacterStill(imageName);

interface Character {
    id: string;
    name: string;
    description: string;
    image: string;
    element: string;
    baseStats: {
        mood: number;
        hunger: number;
        energy: number;
    };
    rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
    specialAbility: string;
    nftMint?: string | null;
}

interface InventoryItem {
    id: string;
    name: string;
    description: string;
    type: 'ingredient' | 'accessory' | 'special' | 'casing';
    rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
    quantity: number;
    icon: string;
}

interface Props {
    characters: Character[];
    selectedCharacter: Character | null;
    onSelectCharacter: (character: Character) => void;
    onExit: () => void;
    walletAddress?: string;
    connected?: boolean;
    onNotification?: (message: string, type: 'info' | 'error' | 'success' | 'warning') => void;
    onCloseStart?: () => void;
}

const MoonokoCollection: React.FC<Props> = ({
    characters,
    selectedCharacter,
    onSelectCharacter,
    onExit,
    onNotification,
    onCloseStart,
}) => {
    const [startIndex, setStartIndex] = useState(0);
    const [activeCategory, setActiveCategory] = useState<string>('Moonokos');
    const [selectedItem, setSelectedItem] = useState<InventoryItem | Character | null>(null);
    const [isClosing, setIsClosing] = useState(false);

    const handleClose = () => {
        if (isClosing) return;
        setIsClosing(true);
        onCloseStart?.();
    };

    // Sample inventory data with actual images
    const inventoryData: Record<string, InventoryItem[]> = {
        'Ingredients': [
            { id: 'star_dust', name: 'Star Dust', description: 'Magical dust from distant stars. Boosts mood when used in food.', type: 'ingredient', rarity: 'Common', quantity: 5, icon: '/glitter.png' },
            { id: 'moon_berries', name: 'Moon Berries', description: 'Sweet berries that glow in the dark. Increases energy significantly.', type: 'ingredient', rarity: 'Rare', quantity: 3, icon: '/apple_collour_.webp' },
            { id: 'stellar_honey', name: 'Stellar Honey', description: 'Golden honey infused with stellar energy. Restores all stats.', type: 'ingredient', rarity: 'Epic', quantity: 1, icon: '/chunky_bubbly_2.webp' },
            { id: 'nebula_spice', name: 'Nebula Spice', description: 'Exotic spice that adds flavor and magic to any dish.', type: 'ingredient', rarity: 'Legendary', quantity: 1, icon: '/miau.webp' }
        ],
        'Accessories': [
            { id: 'star_crown', name: 'Star Crown', description: 'A beautiful crown that makes your moonoko sparkle in the moonlight.', type: 'accessory', rarity: 'Rare', quantity: 1, icon: '/hoshino star.png' },
            { id: 'stellar_scarf', name: 'Stellar Scarf', description: 'A warm scarf woven from stardust threads.', type: 'accessory', rarity: 'Common', quantity: 2, icon: '/backpack_.webp' },
            { id: 'galaxy_collar', name: 'Galaxy Collar', description: 'A collar that shows swirling galaxies within.', type: 'accessory', rarity: 'Epic', quantity: 1, icon: '/io.webp' }
        ],
        'Special Items': [
            { id: 'moon_crystal', name: 'Moon Crystal', description: 'A rare crystal that can reset your moonoko\'s evolution path.', type: 'special', rarity: 'Legendary', quantity: 1, icon: '/null-11.webp' },
            { id: 'star_fragment', name: 'Star Fragment', description: 'A piece of a fallen star. Can be used for special rituals.', type: 'special', rarity: 'Epic', quantity: 2, icon: '/games.webp' },
            { id: 'stellar_potion', name: 'Stellar Potion', description: 'A mysterious potion with unknown effects.', type: 'special', rarity: 'Rare', quantity: 1, icon: '/sleepzzzz.webp' }
        ],
        'Casing': [
            { id: 'galaxy_shell', name: 'Galaxy Shell', description: 'A beautiful shell that changes your device\'s appearance to show galaxies.', type: 'casing', rarity: 'Epic', quantity: 1, icon: '/shop.webp' },
            { id: 'star_frame', name: 'Star Frame', description: 'A golden frame decorated with tiny stars.', type: 'casing', rarity: 'Rare', quantity: 1, icon: '/gallery_.png' },
            { id: 'stellar_border', name: 'Stellar Border', description: 'A shimmering border that pulses with stellar energy.', type: 'casing', rarity: 'Common', quantity: 3, icon: '/chat.webp' }
        ]
    };

    const displayedCharacters = characters.slice(startIndex, startIndex + 6);

    const handlePrevious = () => {
        if (startIndex > 0) {
            setStartIndex(Math.max(0, startIndex - 6));
        }
    };

    const handleNext = () => {
        if (startIndex + 6 < characters.length) {
            setStartIndex(startIndex + 6);
        }
    };

    return (
        <InnerScreen
            expanded
            animateIn
            exiting={isClosing}
            onExitComplete={onExit}
            showBackgroundImage={false}
            leftButtonText=""
            centerButtonText=""
            rightButtonText=""
            onLeftButtonPress={handleClose}
        >
            <View style={styles.content}>
                <View style={styles.inventoryLcdScreen}>
                        {/* Category Tabs - Game Boy Style*/}
                        <View style={styles.inventoryCategoryTabs}>
                            <View style={styles.categoryRow}>
                                <TouchableOpacity
                                    style={[styles.inventoryTab, activeCategory === 'Moonokos' ? styles.active : null]}
                                    onPress={() => setActiveCategory('Moonokos')}
                                >
                                    {/* Tab pixelated borders */}
                                    <View style={styles.tabBorderTop} />
                                    <View style={styles.tabBorderBottom} />
                                    <View style={styles.tabBorderLeft} />
                                    <View style={styles.tabBorderRight} />
                                    <View style={[styles.tabCornerTL, activeCategory === 'Moonokos' ? styles.activeTabCorner : null]} />
                                    <View style={[styles.tabCornerTR, activeCategory === 'Moonokos' ? styles.activeTabCorner : null]} />
                                    <View style={[styles.tabCornerBL, activeCategory === 'Moonokos' ? styles.activeTabCorner : null]} />
                                    <View style={[styles.tabCornerBR, activeCategory === 'Moonokos' ? styles.activeTabCorner : null]} />
                                    {/* Tab dithering */}
                                    <View style={styles.tabDither} />

                                    <Text style={[styles.tabText, activeCategory === 'Moonokos' ? styles.activeTabText : null]}>
                                        MOONOKOS
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.inventoryTab, activeCategory === 'Ingredients' ? styles.active : null]}
                                    onPress={() => setActiveCategory('Ingredients')}
                                >
                                    <View style={styles.tabBorderTop} />
                                    <View style={styles.tabBorderBottom} />
                                    <View style={styles.tabBorderLeft} />
                                    <View style={styles.tabBorderRight} />
                                    <View style={[styles.tabCornerTL, activeCategory === 'Ingredients' ? styles.activeTabCorner : null]} />
                                    <View style={[styles.tabCornerTR, activeCategory === 'Ingredients' ? styles.activeTabCorner : null]} />
                                    <View style={[styles.tabCornerBL, activeCategory === 'Ingredients' ? styles.activeTabCorner : null]} />
                                    <View style={[styles.tabCornerBR, activeCategory === 'Ingredients' ? styles.activeTabCorner : null]} />
                                    <View style={styles.tabDither} />

                                    <Text style={[styles.tabText, activeCategory === 'Ingredients' ? styles.activeTabText : null]}>
                                        INGREDIENTS
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.categoryRow}>
                                <TouchableOpacity
                                    style={[styles.inventoryTab, activeCategory === 'Accessories' ? styles.active : null]}
                                    onPress={() => setActiveCategory('Accessories')}
                                >
                                    <View style={styles.tabBorderTop} />
                                    <View style={styles.tabBorderBottom} />
                                    <View style={styles.tabBorderLeft} />
                                    <View style={styles.tabBorderRight} />
                                    <View style={[styles.tabCornerTL, activeCategory === 'Accessories' ? styles.activeTabCorner : null]} />
                                    <View style={[styles.tabCornerTR, activeCategory === 'Accessories' ? styles.activeTabCorner : null]} />
                                    <View style={[styles.tabCornerBL, activeCategory === 'Accessories' ? styles.activeTabCorner : null]} />
                                    <View style={[styles.tabCornerBR, activeCategory === 'Accessories' ? styles.activeTabCorner : null]} />
                                    <View style={styles.tabDither} />

                                    <Text style={[styles.tabText, activeCategory === 'Accessories' ? styles.activeTabText : null]}>
                                        ACCESSORIES
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.inventoryTab, activeCategory === 'Special Items' ? styles.active : null]}
                                    onPress={() => setActiveCategory('Special Items')}
                                >
                                    <View style={styles.tabBorderTop} />
                                    <View style={styles.tabBorderBottom} />
                                    <View style={styles.tabBorderLeft} />
                                    <View style={styles.tabBorderRight} />
                                    <View style={[styles.tabCornerTL, activeCategory === 'Special Items' ? styles.activeTabCorner : null]} />
                                    <View style={[styles.tabCornerTR, activeCategory === 'Special Items' ? styles.activeTabCorner : null]} />
                                    <View style={[styles.tabCornerBL, activeCategory === 'Special Items' ? styles.activeTabCorner : null]} />
                                    <View style={[styles.tabCornerBR, activeCategory === 'Special Items' ? styles.activeTabCorner : null]} />
                                    <View style={styles.tabDither} />

                                    <Text style={[styles.tabText, activeCategory === 'Special Items' ? styles.activeTabText : null]}>
                                        SPECIAL
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.categoryRowSingle}>
                                <TouchableOpacity
                                    style={[styles.inventoryTab, styles.casingTab, activeCategory === 'Casing' ? styles.active : null]}
                                    onPress={() => setActiveCategory('Casing')}
                                >
                                    <View style={styles.tabBorderTop} />
                                    <View style={styles.tabBorderBottom} />
                                    <View style={styles.tabBorderLeft} />
                                    <View style={styles.tabBorderRight} />
                                    <View style={[styles.tabCornerTL, activeCategory === 'Casing' ? styles.activeTabCorner : null]} />
                                    <View style={[styles.tabCornerTR, activeCategory === 'Casing' ? styles.activeTabCorner : null]} />
                                    <View style={[styles.tabCornerBL, activeCategory === 'Casing' ? styles.activeTabCorner : null]} />
                                    <View style={[styles.tabCornerBR, activeCategory === 'Casing' ? styles.activeTabCorner : null]} />
                                    <View style={styles.tabDither} />

                                    <Text style={[styles.tabText, activeCategory === 'Casing' ? styles.activeTabText : null]}>
                                        CASING
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Dynamic Content Area - Game Boy Grid Style */}
                        <View style={styles.simpleInventoryContainer}>
                            {/* Container pixelated borders */}
                            <View style={styles.containerBorderTop} />
                            <View style={styles.containerBorderBottom} />
                            <View style={styles.containerBorderLeft} />
                            <View style={styles.containerBorderRight} />
                            <View style={styles.containerCornerTL} />
                            <View style={styles.containerCornerTR} />
                            <View style={styles.containerCornerBL} />
                            <View style={styles.containerCornerBR} />
                            {/* Container shadow with dithering */}
                            <View style={styles.containerShadow} />
                            <View style={styles.containerDither1} />
                            <View style={styles.containerDither2} />
                            <View style={styles.containerDither3} />

                            {activeCategory === 'Moonokos' ? (
                                // Moonokos Tab Content
                                <View style={styles.simpleInventoryGrid}>
                                    {displayedCharacters.map((character) => (
                                        <View key={character.id} style={styles.slotWrapper}>
                                            <TouchableOpacity
                                                style={[styles.inventorySlot, selectedItem?.id === character.id ? styles.selected : null]}
                                                onPress={() => {
                                                    setSelectedItem(character);
                                                    onSelectCharacter(character);
                                                }}
                                            >
                                                {/* Pixelated slot borders */}
                                                <View style={styles.slotBorderTop} />
                                                <View style={styles.slotBorderBottom} />
                                                <View style={styles.slotBorderLeft} />
                                                <View style={styles.slotBorderRight} />
                                                <View style={[styles.slotCornerTL, selectedItem?.id === character.id ? styles.selectedCorner : null]} />
                                                <View style={[styles.slotCornerTR, selectedItem?.id === character.id ? styles.selectedCorner : null]} />
                                                <View style={[styles.slotCornerBL, selectedItem?.id === character.id ? styles.selectedCorner : null]} />
                                                <View style={[styles.slotCornerBR, selectedItem?.id === character.id ? styles.selectedCorner : null]} />

                                                <Image
                                                    source={getImageSource(character.image)}
                                                    style={styles.slotImage}
                                                />
                                                {character.nftMint && (
                                                    <View style={styles.nftBadgeOverlay}>
                                                        <Text style={styles.badgeText}>NFT</Text>
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                            {/* Pixelated slot shadow */}
                                            <View style={[styles.slotShadow, selectedItem?.id === character.id ? styles.selectedSlotShadow : null]} />
                                            <View style={[styles.slotShadowCorner, selectedItem?.id === character.id ? styles.selectedShadowCorner : null]} />
                                        </View>
                                    ))}

                                    {/* Fill empty slots if needed */}
                                    {Array.from({ length: Math.max(0, 6 - displayedCharacters.length) }).map((_, index) => (
                                        <View key={`empty-${index}`} style={styles.slotWrapper}>
                                            <View style={[styles.inventorySlot, styles.empty]}>
                                                <Text style={styles.emptySlotIcon}>+</Text>
                                            </View>
                                            <View style={styles.emptySlotShadow} />
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                // Other tabs content (Ingredients, Accessories, etc.)
                                <View style={styles.simpleInventoryGrid}>
                                    {(inventoryData[activeCategory] || []).slice(0, 6).map((item) => (
                                        <View key={item.id} style={styles.slotWrapper}>
                                            <TouchableOpacity
                                                style={[styles.inventorySlot, selectedItem?.id === item.id ? styles.selected : null]}
                                                onPress={() => {
                                                    setSelectedItem(item);
                                                    onNotification?.(`Selected: ${item.name}`, 'info');
                                                }}
                                            >
                                                <Image
                                                    source={{ uri: item.icon }}
                                                    style={styles.slotImage}
                                                />
                                                <View style={styles.itemQuantityBadge}>
                                                    <Text style={styles.badgeText}>x{item.quantity}</Text>
                                                </View>
                                            </TouchableOpacity>
                                            <View style={[styles.slotShadow, selectedItem?.id === item.id ? styles.selectedSlotShadow : null]} />
                                        </View>
                                    ))}

                                    {/* Fill empty slots */}
                                    {Array.from({
                                        length: Math.max(0, 6 - (inventoryData[activeCategory]?.length || 0))
                                    }).map((_, index) => (
                                        <View key={`empty-${index}`} style={styles.slotWrapper}>
                                            <View style={[styles.inventorySlot, styles.empty]}>
                                                <Text style={styles.emptySlotIcon}>+</Text>
                                            </View>
                                            <View style={styles.emptySlotShadow} />
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* Item/Character Description - Game Boy Style */}
                            {selectedItem && (
                                <View style={styles.selectedItemDescription}>
                                    <View style={styles.descriptionHeader}>
                                        <Text style={styles.itemTitle}>
                                            {'element' in selectedItem ? selectedItem.name.toUpperCase() : selectedItem.name.toUpperCase()}
                                        </Text>
                                        {'rarity' in selectedItem && (
                                            <Text style={[styles.rarityBadge, styles[`rarity${selectedItem.rarity.toLowerCase()}`]]}>
                                                {selectedItem.rarity.toUpperCase()}
                                            </Text>
                                        )}
                                    </View>
                                    <View style={styles.descriptionContent}>
                                        {'element' in selectedItem ? (
                                            // Character description
                                            <>
                                                <Text style={styles.descriptionText}>ELEMENT: {selectedItem.element.toUpperCase()}</Text>
                                                <View style={styles.characterStats}>
                                                    <Text style={styles.descriptionText}>
                                                        MOOD: {"★".repeat(selectedItem.baseStats.mood)}{"☆".repeat(5 - selectedItem.baseStats.mood)}
                                                    </Text>
                                                    <Text style={styles.descriptionText}>
                                                        HUNGER: {"★".repeat(selectedItem.baseStats.hunger)}{"☆".repeat(5 - selectedItem.baseStats.hunger)}
                                                    </Text>
                                                    <Text style={styles.descriptionText}>
                                                        ENERGY: {"★".repeat(selectedItem.baseStats.energy)}{"☆".repeat(5 - selectedItem.baseStats.energy)}
                                                    </Text>
                                                </View>
                                            </>
                                        ) : (
                                            // Item description
                                            <>
                                                <Text style={styles.itemDescText}>{selectedItem.description.toUpperCase()}</Text>
                                                <Text style={styles.itemQuantityLarge}>QUANTITY: {selectedItem.quantity}</Text>
                                            </>
                                        )}
                                    </View>
                                </View>
                            )}
                        </View>
                </View>
            </View>
        </InnerScreen>
    );
};

const styles = StyleSheet.create({
    content: {
        flex: 1,
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    container: {
        flex: 1,
        backgroundColor: '#e8fbe4', // Minty Game Boy background
        padding: 12,
        paddingTop: 75, // Space below connect button
        paddingBottom: 100, // Space above Android navigation
        position: 'relative',
    },
    topStatus: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#d4f5c4', // Light minty green
        borderWidth: 0, // Remove CSS border
        borderRadius: 0, // Remove smooth corners
        paddingVertical: 8,
        paddingHorizontal: 16,
        shadowColor: 'transparent',
        position: 'relative',
        marginRight: 8, // Space for shadow
        marginBottom: 16, // Space for shadow
    },
    gearIcon: {
        fontSize: 16,
        color: '#21342b',
    },
    gearImage: {
        width: 16,
        height: 16,
        resizeMode: 'contain',
    },
    walletStatusText: {
        fontSize: 14,
        color: '#21342b', // Dark forest green text
        marginLeft: 8,
        fontFamily: 'PressStart2P',
        fontWeight: 'bold',
        textShadowColor: '#f0fff0',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    mainScreen: {
        flex: 1,
        backgroundColor: '#f0fff0', // Very light minty background
        borderRadius: 0, // Remove smooth corners for authentic Game Boy look
        borderWidth: 0, // Remove CSS border, we'll create pixelated effect
        padding: 10,
        shadowColor: 'transparent', // Disable native shadow, we'll fake it
        position: 'relative',
        marginRight: 8, // Space for shadow
        marginBottom: 8, // Space for shadow
        // Create pixelated border effect with box-shadow
        // Multiple box-shadows to simulate pixel corners
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 0,
    },
    statsBar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: '#d4f5c4',
        borderRadius: 0, // No smooth corners
        paddingVertical: 8,
        borderWidth: 3,
        borderColor: '#2e4630',
        shadowColor: 'transparent',
        position: 'relative',
        marginRight: 3, // Space for shadow
        marginBottom: 15, // Space for shadow
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#2e4630',
    },
    statLabel: {
        color: '#21342b',
        fontSize: 12,
        fontFamily: 'PressStart2P',
        fontWeight: 'bold',
        marginBottom: 2,
        textShadowColor: '#f0fff0',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    starRating: {
        color: '#8B4513', // Dark brown for contrast
        fontSize: 10,
        fontFamily: 'PressStart2P',
    },
    mainDisplayArea: {
        flex: 1,
        height: '100%',
    },
    inventoryLcdScreen: {
        flex: 1,
    },
    inventoryCategoryTabs: {
        marginBottom: 12,
    },
    categoryRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 6,
    },
    categoryRowSingle: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    inventoryTab: {
        paddingVertical: 6,
        paddingHorizontal: 8,
        backgroundColor: '#d4f5c4',
        borderRadius: 0, // No smooth corners
        borderWidth: 0, // Remove CSS border
        flex: 1,
        marginHorizontal: 2,
        alignItems: 'center',
        shadowColor: 'transparent',
        position: 'relative',
        marginRight: 4, // Space for shadow
        marginBottom: 6, // Space for shadow
    },
    casingTab: {
        flex: 0.6,
    },
    active: {
        backgroundColor: '#21342b', // Dark when active
        borderColor: '#d4f5c4',
    },
    tabText: {
        color: '#21342b',
        fontSize: 10,
        fontFamily: 'PressStart2P',
        fontWeight: 'bold',
        textAlign: 'center',
        textShadowColor: '#f0fff0',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    activeTabText: {
        color: '#d4f5c4', // Light text when active
        textShadowColor: '#000',
    },
    simpleInventoryContainer: {
        flex: 1,
        backgroundColor: '#f0fff0',
        borderRadius: 0, // No smooth corners
        padding: 8,
        borderWidth: 0, // Remove CSS border
        shadowColor: 'transparent',
        position: 'relative',
        marginRight: 6, // Space for shadow
        marginBottom: 8, // Space for shadow
    },
    simpleInventoryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-around',
        marginBottom: 12,
    },
    inventorySlot: {
        width: 80,
        height: 80,
        backgroundColor: '#f0fff0', // Light Game Boy background
        borderRadius: 0, // No smooth corners - authentic Game Boy
        alignItems: 'center',
        justifyContent: 'center',
        margin: 4,
        position: 'relative',
        borderWidth: 0, // Remove CSS border, we'll create pixelated version
        shadowColor: 'transparent', // No native shadow
        marginRight: 8, // Space for pixelated shadow
        marginBottom: 8, // Space for pixelated shadow
    },
    selected: {
        backgroundColor: '#21342b', // Dark when selected
        borderColor: '#d4f5c4',
        borderWidth: 3, // Thicker border when selected
        shadowColor: 'transparent',
        marginRight: 8, // More shadow space when selected
        marginBottom: 8,
    },
    empty: {
        backgroundColor: '#e8fbe4',
        borderColor: '#2e4630',
        borderStyle: 'dashed',
        borderWidth: 2,
        shadowOpacity: 0.2,
    },
    slotImage: {
        width: 60,
        height: 60,
        resizeMode: 'contain',
        // Add slight contrast for retro pop
    },
    nftBadgeOverlay: {
        position: 'absolute',
        top: 2,
        right: 2,
        backgroundColor: '#21342b',
        paddingHorizontal: 3,
        paddingVertical: 1,
        borderRadius: 2,
        borderWidth: 1,
        borderColor: '#d4f5c4',
    },
    itemQuantityBadge: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        backgroundColor: '#8B4513', // Brown badge
        paddingHorizontal: 3,
        paddingVertical: 1,
        borderRadius: 2,
        borderWidth: 1,
        borderColor: '#f0fff0',
    },
    badgeText: {
        color: '#f0fff0',
        fontSize: 8,
        fontFamily: 'PressStart2P',
        fontWeight: 'bold',
    },
    emptySlotIcon: {
        fontSize: 20,
        color: '#2e4630',
        opacity: 0.5,
        fontFamily: 'PressStart2P',
        fontWeight: 'bold',
    },
    selectedItemDescription: {
        backgroundColor: '#d4f5c4',
        borderWidth: 3,
        borderColor: '#2e4630',
        padding: 10,
        borderRadius: 0, // No smooth corners
        marginTop: 8,
        shadowColor: 'transparent',
        position: 'relative',
        marginRight: 3, // Space for shadow
        marginBottom: 5, // Space for shadow
    },
    descriptionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#2e4630',
        paddingBottom: 4,
    },
    itemTitle: {
        color: '#21342b',
        fontSize: 12,
        fontFamily: 'PressStart2P',
        fontWeight: 'bold',
        flex: 1,
        textShadowColor: '#f0fff0',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    rarityBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 3,
        fontSize: 8,
        fontFamily: 'PressStart2P',
        fontWeight: 'bold',
        borderWidth: 1,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    raritycommon: {
        backgroundColor: '#8B8B83',
        borderColor: '#2e4630',
        color: '#f0fff0',
    },
    rarityrare: {
        backgroundColor: '#4169E1',
        borderColor: '#2e4630',
        color: '#f0fff0',
    },
    rarityepic: {
        backgroundColor: '#8A2BE2',
        borderColor: '#2e4630',
        color: '#f0fff0',
    },
    raritylegendary: {
        backgroundColor: '#FF8C00',
        borderColor: '#2e4630',
        color: '#21342b',
    },
    descriptionContent: {
        marginTop: 4,
    },
    descriptionText: {
        color: '#21342b',
        fontSize: 10,
        fontFamily: 'PressStart2P',
        marginBottom: 2,
        textShadowColor: '#f0fff0',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    characterStats: {
        marginTop: 4,
        backgroundColor: '#f0fff0',
        borderRadius: 0, // No smooth corners
        padding: 6,
        borderWidth: 2,
        borderColor: '#2e4630',
        shadowColor: 'transparent',
        position: 'relative',
        marginRight: 2, // Space for shadow
        marginBottom: 3, // Space for shadow
    },
    itemDescText: {
        color: '#21342b',
        fontSize: 10,
        fontFamily: 'PressStart2P',
        lineHeight: 14,
        textShadowColor: '#f0fff0',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    itemQuantityLarge: {
        color: '#21342b',
        fontSize: 10,
        fontFamily: 'PressStart2P',
        fontWeight: 'bold',
        marginTop: 4,
        textShadowColor: '#f0fff0',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },
    bottomButton: {
        position: 'absolute',
        bottom: 55, // Increased from 15 to avoid Android navigation
        width: 80,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonBorder: {
        backgroundColor: '#d4f5c4',
        borderWidth: 3,
        borderColor: '#2e4630',
        borderRadius: 0, // No smooth corners
        paddingHorizontal: 12,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: 'transparent',
        position: 'relative',
        marginRight: 4, // Space for shadow
        marginBottom: 4, // Space for shadow
    },
    left: {
        left: 20,
    },
    center: {
        left: '50%',
        transform: [{ translateX: -40 }],
    },
    right: {
        right: 20,
    },
    buttonText: {
        color: '#21342b',
        fontSize: 10,
        fontFamily: 'PressStart2P',
        fontWeight: 'bold',
        textShadowColor: '#f0fff0',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
    },

    // Pixelated border system - more authentic Game Boy corners
    pixelBorderTop: {
        position: 'absolute',
        top: 0,
        left: 3,
        right: 3,
        height: 3,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    pixelBorderBottom: {
        position: 'absolute',
        bottom: 0,
        left: 3,
        right: 3,
        height: 3,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    pixelBorderLeft: {
        position: 'absolute',
        top: 3,
        bottom: 3,
        left: 0,
        width: 3,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    pixelBorderRight: {
        position: 'absolute',
        top: 3,
        bottom: 3,
        right: 0,
        width: 3,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },

    // Pixelated corners
    cornerTopLeft: {
        position: 'absolute',
        top: 1,
        left: 1,
        width: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    cornerTopRight: {
        position: 'absolute',
        top: 1,
        right: 1,
        width: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    cornerBottomLeft: {
        position: 'absolute',
        bottom: 1,
        left: 1,
        width: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    cornerBottomRight: {
        position: 'absolute',
        bottom: 1,
        right: 1,
        width: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },

    // More authentic dithered shadows
    screenShadowLayer1: {
        position: 'absolute',
        top: 6,
        right: -6,
        bottom: -6,
        width: 6,
        backgroundColor: '#a8c4a8', // Medium green shadow
        zIndex: -1,
    },
    screenShadowLayer2: {
        position: 'absolute',
        bottom: -6,
        left: 6,
        right: -6,
        height: 6,
        backgroundColor: '#a8c4a8', // Medium green shadow
        zIndex: -1,
    },
    shadowCornerTopRight: {
        position: 'absolute',
        top: 3,
        right: -3,
        width: 3,
        height: 3,
        backgroundColor: '#b8d4b8', // Lighter shadow for corner
        zIndex: -1,
    },
    shadowCornerBottomLeft: {
        position: 'absolute',
        bottom: -3,
        left: 3,
        width: 3,
        height: 3,
        backgroundColor: '#b8d4b8', // Lighter shadow for corner
        zIndex: -1,
    },
    shadowCornerBottomRight: {
        position: 'absolute',
        bottom: -3,
        right: -3,
        width: 3,
        height: 3,
        backgroundColor: '#98b898', // Darker corner shadow
        zIndex: -1,
    },
    statsShadow: {
        position: 'absolute',
        top: 3,
        right: -3,
        bottom: -3,
        width: 3,
        backgroundColor: '#b8d4b8', // Light shadow
        zIndex: -1,
    },
    slotWrapper: {
        position: 'relative',
    },
    slotShadow: {
        position: 'absolute',
        top: 8,
        right: -4,
        width: 80,
        height: 80,
        backgroundColor: '#c8e4c8', // Light shadow for slots
        zIndex: -1,
    },
    slotShadowCorner: {
        position: 'absolute',
        top: 4,
        right: -8,
        width: 4,
        height: 4,
        backgroundColor: '#b8d4b8', // Corner shadow
        zIndex: -1,
    },
    selectedSlotShadow: {
        backgroundColor: '#98b898', // Darker shadow when selected
        top: 10,
        right: -6,
    },
    selectedShadowCorner: {
        backgroundColor: '#88a888',
        top: 6,
        right: -10,
    },
    emptySlotShadow: {
        backgroundColor: '#d8f4d8', // Very light shadow for empty slots
        opacity: 0.6,
    },

    // Pixelated slot borders
    slotBorderTop: {
        position: 'absolute',
        top: 0,
        left: 2,
        right: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    slotBorderBottom: {
        position: 'absolute',
        bottom: 0,
        left: 2,
        right: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    slotBorderLeft: {
        position: 'absolute',
        top: 2,
        bottom: 2,
        left: 0,
        width: 2,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    slotBorderRight: {
        position: 'absolute',
        top: 2,
        bottom: 2,
        right: 0,
        width: 2,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    slotCornerTL: {
        position: 'absolute',
        top: 1,
        left: 1,
        width: 1,
        height: 1,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    slotCornerTR: {
        position: 'absolute',
        top: 1,
        right: 1,
        width: 1,
        height: 1,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    slotCornerBL: {
        position: 'absolute',
        bottom: 1,
        left: 1,
        width: 1,
        height: 1,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    slotCornerBR: {
        position: 'absolute',
        bottom: 1,
        right: 1,
        width: 1,
        height: 1,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    selectedCorner: {
        backgroundColor: '#d4f5c4', // Light border when selected
    },

    // Top Status pixelated borders
    statusBorderTop: {
        position: 'absolute',
        top: 0,
        left: 3,
        right: 3,
        height: 3,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    statusBorderBottom: {
        position: 'absolute',
        bottom: 0,
        left: 3,
        right: 3,
        height: 3,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    statusBorderLeft: {
        position: 'absolute',
        top: 3,
        bottom: 3,
        left: 0,
        width: 3,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    statusBorderRight: {
        position: 'absolute',
        top: 3,
        bottom: 3,
        right: 0,
        width: 3,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    statusCornerTL: {
        position: 'absolute',
        top: 1,
        left: 1,
        width: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    statusCornerTR: {
        position: 'absolute',
        top: 1,
        right: 1,
        width: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    statusCornerBL: {
        position: 'absolute',
        bottom: 1,
        left: 1,
        width: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    statusCornerBR: {
        position: 'absolute',
        bottom: 1,
        right: 1,
        width: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    statusShadow: {
        position: 'absolute',
        top: 6,
        right: -6,
        bottom: -6,
        width: 6,
        backgroundColor: '#b8d4b8',
        zIndex: -1,
    },
    statusDither1: {
        position: 'absolute',
        top: 4,
        right: -4,
        width: 2,
        height: 2,
        backgroundColor: '#c8e4c8',
        zIndex: -1,
    },
    statusDither2: {
        position: 'absolute',
        bottom: -4,
        left: 4,
        width: 2,
        height: 2,
        backgroundColor: '#c8e4c8',
        zIndex: -1,
    },

    // Tab pixelated borders
    tabBorderTop: {
        position: 'absolute',
        top: 0,
        left: 2,
        right: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    tabBorderBottom: {
        position: 'absolute',
        bottom: 0,
        left: 2,
        right: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    tabBorderLeft: {
        position: 'absolute',
        top: 2,
        bottom: 2,
        left: 0,
        width: 2,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    tabBorderRight: {
        position: 'absolute',
        top: 2,
        bottom: 2,
        right: 0,
        width: 2,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    tabCornerTL: {
        position: 'absolute',
        top: 1,
        left: 1,
        width: 1,
        height: 1,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    tabCornerTR: {
        position: 'absolute',
        top: 1,
        right: 1,
        width: 1,
        height: 1,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    tabCornerBL: {
        position: 'absolute',
        bottom: 1,
        left: 1,
        width: 1,
        height: 1,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    tabCornerBR: {
        position: 'absolute',
        bottom: 1,
        right: 1,
        width: 1,
        height: 1,
        backgroundColor: '#2e4630',
        zIndex: 5,
    },
    activeTabCorner: {
        backgroundColor: '#d4f5c4',
    },
    tabDither: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 2,
        height: 2,
        backgroundColor: '#c8e4c8',
        zIndex: -1,
    },

    // Container pixelated borders
    containerBorderTop: {
        position: 'absolute',
        top: 0,
        left: 3,
        right: 3,
        height: 3,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    containerBorderBottom: {
        position: 'absolute',
        bottom: 0,
        left: 3,
        right: 3,
        height: 3,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    containerBorderLeft: {
        position: 'absolute',
        top: 3,
        bottom: 3,
        left: 0,
        width: 3,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    containerBorderRight: {
        position: 'absolute',
        top: 3,
        bottom: 3,
        right: 0,
        width: 3,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    containerCornerTL: {
        position: 'absolute',
        top: 1,
        left: 1,
        width: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    containerCornerTR: {
        position: 'absolute',
        top: 1,
        right: 1,
        width: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    containerCornerBL: {
        position: 'absolute',
        bottom: 1,
        left: 1,
        width: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    containerCornerBR: {
        position: 'absolute',
        bottom: 1,
        right: 1,
        width: 2,
        height: 2,
        backgroundColor: '#2e4630',
        zIndex: 10,
    },
    containerShadow: {
        position: 'absolute',
        top: 4,
        right: -4,
        bottom: -4,
        width: 4,
        backgroundColor: '#b8d4b8',
        zIndex: -1,
    },
    containerDither1: {
        position: 'absolute',
        top: 2,
        right: -2,
        width: 2,
        height: 2,
        backgroundColor: '#c8e4c8',
        zIndex: -1,
    },
    containerDither2: {
        position: 'absolute',
        bottom: -2,
        left: 2,
        width: 2,
        height: 2,
        backgroundColor: '#c8e4c8',
        zIndex: -1,
    },
    containerDither3: {
        position: 'absolute',
        bottom: -6,
        right: -6,
        width: 2,
        height: 2,
        backgroundColor: '#a8c4a8',
        zIndex: -1,
    },
});

export default MoonokoCollection;