import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { MarketplaceService, MarketplaceItem, ItemCategory, ItemRarity } from '../services/MarketplaceService';
import { GlobalPointSystem } from '../services/GlobalPointSystem';
import { useWallet } from '../contexts/WalletContext';
import { Connection } from '@solana/web3.js';
import InnerScreen from './InnerScreen';
import { Ingredients } from '../assets';
const PinkSugar = Ingredients.pinkSugar;
const NovaEgg = Ingredients.novaEgg;
const MiraBerry = Ingredients.miraBerry;

interface ShopProps {
    connection: Connection;
    onNotification?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    onClose: () => void;
    onCloseStart?: () => void;
    onItemsPurchased?: (items: MarketplaceItem[]) => void;
}

const Shop: React.FC<ShopProps> = ({ connection, onNotification, onClose, onCloseStart, onItemsPurchased }) => {
    const [selectedCategory, setSelectedCategory] = useState<string>('food');
    const [items, setItems] = useState<MarketplaceItem[]>([]);
    const [dust, setDust] = useState<number>(100);
    const [cart, setCart] = useState<{ item: MarketplaceItem, quantity: number }[]>([]);
    const [flashingItem, setFlashingItem] = useState<string | null>(null);
    const [isClosing, setIsClosing] = useState(false);

    const handleClose = () => {
        if (isClosing) return;
        setIsClosing(true);
        onCloseStart?.();
    };

    const getTotalPrice = () => {
        return cart.reduce((total, cartItem) => total + (cartItem.item.priceStarFragments * cartItem.quantity), 0);
    };

    const getRarityBorderColor = (rarity: ItemRarity): string => {
        switch (rarity) {
            case ItemRarity.COMMON: return '#8B8B8B';
            case ItemRarity.UNCOMMON: return '#4CAF50';
            case ItemRarity.RARE: return '#2196F3';
            case ItemRarity.EPIC: return '#9C27B0';
            case ItemRarity.LEGENDARY: return '#FF9800';
            default: return '#003300';
        }
    };

    const addToCart = (item: MarketplaceItem) => {
        const totalCostAfterAdd = getTotalPrice() + item.priceStarFragments;
        if (totalCostAfterAdd > dust) {
            onNotification?.(`Not enough Star Dust! You need ${totalCostAfterAdd} but only have ${dust}.`, 'error');
            return;
        }

        setCart(prevCart => {
            const existingItem = prevCart.find(cartItem => cartItem.item.id === item.id);
            if (existingItem) {
                return prevCart.map(cartItem =>
                    cartItem.item.id === item.id
                        ? { ...cartItem, quantity: cartItem.quantity + 1 }
                        : cartItem
                );
            } else {
                return [...prevCart, { item, quantity: 1 }];
            }
        });

        setDust(prevDust => prevDust - item.priceStarFragments);

        setFlashingItem(item.id);
        setTimeout(() => setFlashingItem(null), 300);

        onNotification?.(`Added ${item.name} to cart! ${item.priceStarFragments} Star Dust deducted.`, 'success');
    };

    const removeFromCart = (itemId: string) => {
        const itemToRemove = cart.find(cartItem => cartItem.item.id === itemId);
        if (itemToRemove) {
            const refundAmount = itemToRemove.item.priceStarFragments * itemToRemove.quantity;
            setDust(prevDust => prevDust + refundAmount);
            onNotification?.(`Removed ${itemToRemove.item.name} from cart. ${refundAmount} Star Dust refunded.`, 'info');
        }
        setCart(prevCart => prevCart.filter(cartItem => cartItem.item.id !== itemId));
    };

    const clearCart = () => {
        if (cart.length === 0) return;

        const totalRefund = getTotalPrice();
        setDust(prevDust => prevDust + totalRefund);
        setCart([]);
        onNotification?.(`Cart cleared! ${totalRefund} Star Dust refunded.`, 'info');
    };

    const handleCheckout = () => {
        if (cart.length === 0) {
            onNotification?.('Your cart is empty!', 'warning');
            return;
        }

        const purchasedItems = cart.map(cartItem => cartItem.item);

        if (onItemsPurchased) {
            onItemsPurchased(purchasedItems);
        }

        setCart([]);

        onNotification?.(`Purchase complete! ${purchasedItems.length} items added to your ingredient inventory.`, 'success');
    };

    useEffect(() => {
        const itemsData = [
            {
                id: 'sugar',
                name: 'Pink Sugar',
                description: 'Sweet crystalline sugar with a pink hue',
                imageUrl: PinkSugar,
                category: ItemCategory.FOOD,
                rarity: ItemRarity.COMMON,
                priceSOL: 0,
                priceStarFragments: 15,
                inStock: true,
            },
            {
                id: 'nova',
                name: 'Nova Egg',
                description: 'A mysterious egg that glows with stellar energy',
                imageUrl: NovaEgg,
                category: ItemCategory.FOOD,
                rarity: ItemRarity.UNCOMMON,
                priceSOL: 0,
                priceStarFragments: 25,
                inStock: true,
            },
            {
                id: 'mira',
                name: 'Mira Berry',
                description: 'A rare berry with stellar properties',
                imageUrl: MiraBerry,
                category: ItemCategory.FOOD,
                rarity: ItemRarity.RARE,
                priceSOL: 0,
                priceStarFragments: 20,
                inStock: true,
            },
            {
                id: 'speed-boost',
                name: 'Speed Boost',
                description: 'Increases movement speed temporarily',
                imageUrl: 'https://via.placeholder.com/48/00FF00/000000?text=⚡',
                category: ItemCategory.POWERUP,
                rarity: ItemRarity.COMMON,
                priceSOL: 0,
                priceStarFragments: 12,
                inStock: true,
            },
            {
                id: 'star-shield',
                name: 'Star Shield',
                description: 'Provides stellar protection',
                imageUrl: 'https://via.placeholder.com/48/4169E1/000000?text=🛡️',
                category: ItemCategory.POWERUP,
                rarity: ItemRarity.RARE,
                priceSOL: 0,
                priceStarFragments: 45,
                inStock: true,
            },
        ];

        console.log('Loading shop catalog (no wallet needed)');
        setItems(itemsData);
    }, []);

    const filteredItems = useMemo(() => {
        if (!items.length) return [];
        if (selectedCategory === 'all') return items;
        if (selectedCategory === 'currency') return [];
        return items.filter(item => {
            if (selectedCategory === 'food') return item.category === ItemCategory.FOOD;
            if (selectedCategory === 'powerups') return item.category === ItemCategory.POWERUP;
            if (selectedCategory === 'cosmetics') return item.category === ItemCategory.COSMETIC;
            if (selectedCategory === 'collectibles') return item.category === ItemCategory.UTILITY;
            return false;
        });
    }, [items, selectedCategory]);

    return (
        <InnerScreen
            onLeftButtonPress={handleClose}
            leftButtonText=""
            centerButtonText=""
            rightButtonText=""
            expanded
            animateIn
            exiting={isClosing}
            onExitComplete={onClose}
        >
            <View style={styles.shopContent}>
            <View style={styles.balanceRow}>
                <View style={styles.dustIconContainer}>
                    <Image
                        source={{ uri: 'https://drive.google.com/uc?export=view&id=1bxf-gZ9VjrwtKr5K8A5A7pbHFyQGXACU' }}
                        style={styles.dustIcon}
                        resizeMode="contain"
                    />
                </View>
                <View style={styles.dustTextContainer}>
                    <Text style={styles.walletLabel}>WALLET</Text>
                    <Text style={styles.dustAmount}>{dust} Star Dust</Text>
                </View>
            </View>

            <View style={styles.tabNavigation}>
                {[
                    { id: 'currency', label: 'Currency' },
                    { id: 'all', label: 'All' },
                    { id: 'food', label: 'Food' },
                    { id: 'powerups', label: 'Powerups' },
                    { id: 'cosmetics', label: 'Cosmetics' },
                    { id: 'collectibles', label: 'Collectibles' },
                ].map(tab => (
                    <TouchableOpacity
                        key={tab.id}
                        style={[styles.tabButton, selectedCategory === tab.id && styles.activeTab]}
                        onPress={() => setSelectedCategory(tab.id)}
                    >
                        <Text style={styles.tabButtonText}>{tab.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.itemsContainer}>
                {Array.from({ length: 6 }).map((_, index) => {
                    const item = filteredItems[index];
                    return (
                        <View key={index} style={[
                            styles.itemCard,
                            item && { borderColor: getRarityBorderColor(item.rarity) },
                            item && flashingItem === item.id && styles.flashingCard
                        ]}>
                            {item ? (
                                <>
                                    <TouchableOpacity
                                        style={[
                                            styles.itemClickArea,
                                            (getTotalPrice() + item.priceStarFragments > dust) && styles.disabledItem
                                        ]}
                                        onPress={() => addToCart(item)}
                                        disabled={getTotalPrice() + item.priceStarFragments > dust}
                                    >
                                        <Image
                                            source={typeof item.imageUrl === 'string' ? { uri: item.imageUrl } : item.imageUrl}
                                            style={styles.itemImage}
                                            resizeMode="contain"
                                            onError={(error) => console.log('Image failed to load:', item.name, error)}
                                            onLoad={() => console.log('Image loaded successfully:', item.name)}
                                        />
                                        <Text style={[
                                            styles.itemName,
                                            (getTotalPrice() + item.priceStarFragments > dust) && styles.disabledText
                                        ]}>
                                            {item.name}
                                        </Text>
                                        <View style={styles.priceContainer}>
                                            <Image
                                                source={{ uri: 'https://drive.google.com/uc?export=view&id=1bxf-gZ9VjrwtKr5K8A5A7pbHFyQGXACU' }}
                                                style={styles.priceIcon}
                                                resizeMode="contain"
                                            />
                                            <Text style={[
                                                styles.itemPrice,
                                                (getTotalPrice() + item.priceStarFragments > dust) && styles.disabledText
                                            ]}>
                                                {item.priceStarFragments}
                                            </Text>
                                        </View>
                                        {getTotalPrice() + item.priceStarFragments > dust && (
                                            <Text style={styles.insufficientText}>INSUFFICIENT</Text>
                                        )}
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <View style={styles.placeholderBox}>
                                    <Text style={styles.placeholderText}>+</Text>
                                </View>
                            )}
                        </View>
                    );
                })}
            </View>

            <View style={styles.cartContainer}>
                <View style={styles.cartHeader}>
                    <Text style={styles.cartTitle}>CART ({cart.length})</Text>
                    <View style={styles.cartHeaderRight}>
                        <View style={styles.cartTotal}>
                            <Image
                                source={{ uri: 'https://drive.google.com/uc?export=view&id=1bxf-gZ9VjrwtKr5K8A5A7pbHFyQGXACU' }}
                                style={styles.cartTotalIcon}
                                resizeMode="contain"
                            />
                            <Text style={styles.cartTotalText}>{getTotalPrice()}</Text>
                        </View>
                        {cart.length > 0 && (
                            <TouchableOpacity
                                style={styles.clearCartButton}
                                onPress={clearCart}
                            >
                                <Text style={styles.clearCartText}>CLEAR</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {cart.length > 0 ? (
                    <View style={styles.cartItems}>
                        <View style={styles.cartItemsRow}>
                            {cart.map(cartItem => (
                                <View key={cartItem.item.id} style={styles.cartItem}>
                                    <TouchableOpacity
                                        style={styles.removeButton}
                                        onPress={() => removeFromCart(cartItem.item.id)}
                                    >
                                        <Text style={styles.removeButtonText}>×</Text>
                                    </TouchableOpacity>
                                    <Image
                                        source={typeof cartItem.item.imageUrl === 'string' ? { uri: cartItem.item.imageUrl } : cartItem.item.imageUrl}
                                        style={styles.cartItemImage}
                                        resizeMode="contain"
                                    />
                                    <Text style={styles.cartItemQuantity}>x{cartItem.quantity}</Text>
                                </View>
                            ))}
                        </View>
                        <TouchableOpacity
                            style={styles.checkoutButton}
                            onPress={handleCheckout}
                        >
                            <Text style={styles.checkoutButtonText}>CHECKOUT</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.emptyCart}>
                        <Text style={styles.emptyCartText}>Cart is empty</Text>
                    </View>
                )}
            </View>

            </View>
        </InnerScreen>
    );
};

const styles = StyleSheet.create({
    shopContent: {
        flex: 1,
        width: '100%',
        padding: 8,
    },
    balanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderWidth: 2,
        borderColor: '#003300',
        borderRadius: 0,
        padding: 10,
        borderTopColor: '#006600',
        borderLeftColor: '#006600',
        borderRightColor: '#001100',
        borderBottomColor: '#001100',
        shadowColor: '#001100',
        shadowOffset: { width: 1, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 0,
        elevation: 0,
    },
    dustIconContainer: {
        justifyContent: 'flex-start',
    },
    dustTextContainer: {
        justifyContent: 'flex-end',
        alignItems: 'flex-end',
    },
    dustIcon: {
        width: 48,
        height: 48,
    },
    dustAmount: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#003300',
        textAlign: 'right',
    },
    walletLabel: {
        fontSize: 12,
        color: '#666',
        textAlign: 'right',
        marginBottom: 2,
    },
    tabNavigation: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    tabButton: {
        width: '30%',
        backgroundColor: '#dbf3db',
        borderColor: '#003300',
        borderWidth: 2,
        paddingVertical: 8,
        marginVertical: 2,
        alignItems: 'center',
        borderRadius: 0,
        borderTopColor: '#006600',
        borderLeftColor: '#006600',
        borderRightColor: '#001100',
        borderBottomColor: '#001100',
        shadowColor: '#001100',
        shadowOffset: { width: 1, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 0,
        elevation: 0,
    },
    activeTab: {
        backgroundColor: '#b8e6b8',
        borderTopColor: '#001100',
        borderLeftColor: '#001100',
        borderRightColor: '#006600',
        borderBottomColor: '#006600',
        shadowColor: '#003300',
        shadowOffset: { width: -1, height: -1 },
        shadowOpacity: 0.3,
        shadowRadius: 0,
        elevation: 0,
    },
    tabButtonText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#003300',
    },
    itemsContainer: {
        borderWidth: 3,
        borderColor: '#003300',
        backgroundColor: '#f6fff6',
        padding: 6,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-evenly',
        paddingBottom: 12,
        borderRadius: 0,
        borderTopColor: '#001100',
        borderLeftColor: '#001100',
        borderRightColor: '#006600',
        borderBottomColor: '#006600',
        shadowColor: '#001100',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 0,
        elevation: 0,
    },
    itemCard: {
        width: '30%',
        height: 120,
        borderWidth: 3,
        borderColor: '#003300',
        backgroundColor: '#f0fff0',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        marginBottom: 8,
        borderRadius: 0,
        shadowColor: '#001100',
        shadowOffset: { width: 1, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 0,
        elevation: 0,
    },
    itemClickArea: {
        flex: 1,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemImage: {
        width: 50,
        height: 50,
        marginBottom: 6,
    },
    itemName: {
        fontSize: 11,
        fontWeight: 'bold',
        marginBottom: 4,
        textAlign: 'center',
        color: '#003300',
    },
    disabledItem: {
        opacity: 0.5,
    },
    disabledText: {
        color: '#999999',
    },
    insufficientText: {
        fontSize: 7,
        fontWeight: 'bold',
        color: '#ff6b6b',
        marginTop: 2,
        textAlign: 'center',
    },
    priceContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 51, 0, 0.1)',
        borderWidth: 1,
        borderColor: '#003300',
        borderRadius: 0,
        paddingHorizontal: 6,
        paddingVertical: 3,
    },
    priceIcon: {
        width: 12,
        height: 12,
        marginRight: 4,
    },
    itemPrice: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#003300',
    },
    placeholderBox: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#999',
        backgroundColor: 'transparent',
        borderStyle: 'dashed',
        borderRadius: 0,
        margin: 2,
        opacity: 0.7,
    },
    placeholderText: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#bbb',
        opacity: 0.6,
    },
    buyButton: {
        borderWidth: 2,
        borderColor: '#003300',
        paddingVertical: 3,
        paddingHorizontal: 6,
        backgroundColor: '#dbf3db',
        borderRadius: 0,
        borderTopColor: '#f0fff0',
        borderLeftColor: '#f0fff0',
        borderRightColor: '#006600',
        borderBottomColor: '#006600',
        shadowColor: '#001100',
        shadowOffset: { width: 1, height: 1 },
        shadowOpacity: 0.4,
        shadowRadius: 0,
        elevation: 2,
    },
    buyButtonText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#003300',
        textShadowColor: 'rgba(255, 255, 255, 0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 0,
    },
    disabledButton: {
        backgroundColor: '#cccccc',
        borderTopColor: '#e0e0e0',
        borderLeftColor: '#e0e0e0',
        borderRightColor: '#999999',
        borderBottomColor: '#999999',
        shadowOpacity: 0.2,
    },
    disabledButtonText: {
        color: '#666666',
        fontSize: 7,
        textShadowColor: 'transparent',
    },
    flashingCard: {
        backgroundColor: '#e6ffe6',
        shadowColor: '#00ff00',
        shadowOpacity: 0.8,
        shadowRadius: 4,
        elevation: 8,
    },
    cartContainer: {
        borderWidth: 3,
        borderColor: '#003300',
        backgroundColor: '#f6fff6',
        marginBottom: 8,
        borderRadius: 0,
        borderTopColor: '#001100',
        borderLeftColor: '#001100',
        borderRightColor: '#006600',
        borderBottomColor: '#006600',
        shadowColor: '#001100',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 0,
        elevation: 0,
    },
    cartHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 8,
        borderBottomWidth: 2,
        borderBottomColor: '#003300',
        backgroundColor: '#e9f5e9',
    },
    cartHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cartTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#003300',
    },
    cartTotal: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    cartTotalIcon: {
        width: 14,
        height: 14,
        marginRight: 4,
    },
    cartTotalText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#003300',
    },
    clearCartButton: {
        backgroundColor: '#ff6b6b',
        borderWidth: 2,
        borderColor: '#cc0000',
        borderRadius: 0,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderTopColor: '#ff9999',
        borderLeftColor: '#ff9999',
        borderRightColor: '#cc0000',
        borderBottomColor: '#990000',
        shadowColor: '#660000',
        shadowOffset: { width: 1, height: 1 },
        shadowOpacity: 0.4,
        shadowRadius: 0,
        elevation: 2,
    },
    clearCartText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: 'white',
        textShadowColor: 'rgba(0, 0, 0, 0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 0,
    },
    cartItems: {
        padding: 8,
    },
    cartItemsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
        alignItems: 'center',
        marginBottom: 8,
    },
    cartItem: {
        alignItems: 'center',
        marginRight: 12,
        marginBottom: 8,
        position: 'relative',
    },
    cartItemImage: {
        width: 40,
        height: 40,
        borderWidth: 2,
        borderColor: '#003300',
        borderRadius: 0,
        backgroundColor: '#f0fff0',
    },
    cartItemQuantity: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#003300',
        marginTop: 2,
        textAlign: 'center',
    },
    removeButton: {
        position: 'absolute',
        top: -6,
        right: -6,
        backgroundColor: '#ff6b6b',
        borderRadius: 10,
        width: 16,
        height: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#cc0000',
        zIndex: 1,
    },
    removeButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 12,
        lineHeight: 10,
    },
    emptyCart: {
        padding: 20,
        alignItems: 'center',
    },
    emptyCartText: {
        fontSize: 12,
        color: '#666',
    },
    checkoutButton: {
        marginTop: 8,
        backgroundColor: '#006600',
        padding: 10,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#003300',
        borderRadius: 0,
        borderTopColor: '#00aa00',
        borderLeftColor: '#00aa00',
        borderRightColor: '#004400',
        borderBottomColor: '#002200',
        shadowColor: '#001100',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 0,
        elevation: 3,
    },
    checkoutButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 12,
        textShadowColor: 'rgba(0, 0, 0, 0.6)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 0,
    },
});

export default Shop;