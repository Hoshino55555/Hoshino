// Save this as: src/components/GameContainer.tsx
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Connection } from '@solana/web3.js';
import Shop from './Shop';
import IngredientSelection from './IngredientSelection';
import { useInventory } from '../hooks/useInventory';
import { MarketplaceItem } from '../services/MarketplaceService';

interface GameContainerProps {
    connection: Connection;
    onNotification?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

const GameContainer: React.FC<GameContainerProps> = ({ connection, onNotification }) => {
    const [currentView, setCurrentView] = useState<'shop' | 'ingredients'>('shop');
    const inventory = useInventory();

    const handleItemsPurchased = (items: MarketplaceItem[]) => {
        inventory.addItemsToInventory(items);
        const itemNames = items.map(item => item.name).join(', ');
        onNotification?.(`🛒 ${itemNames} added to your ingredient inventory!`, 'success');
    };

    const handleCraftFood = (foodId: string, foodName: string) => {
        // You can implement recipe logic here to remove used ingredients
        onNotification?.(`🍳 Successfully crafted ${foodName}!`, 'success');
    };

    const handleClose = () => {
        // Handle closing the entire game interface
        console.log('Game interface closed');
    };

    return (
        <View style={styles.container}>
            {/* Navigation Bar */}
            <View style={styles.navBar}>
                <TouchableOpacity
                    style={[styles.navButton, currentView === 'shop' && styles.activeNavButton]}
                    onPress={() => setCurrentView('shop')}
                >
                    <Text style={[styles.navButtonText, currentView === 'shop' && styles.activeNavText]}>
                        🛒 SHOP
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.navButton, currentView === 'ingredients' && styles.activeNavButton]}
                    onPress={() => setCurrentView('ingredients')}
                >
                    <Text style={[styles.navButtonText, currentView === 'ingredients' && styles.activeNavText]}>
                        🍳 KITCHEN ({inventory.totalItems})
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Current View */}
            {currentView === 'shop' && (
                <Shop
                    connection={connection}
                    onNotification={onNotification}
                    onClose={handleClose}
                    onItemsPurchased={handleItemsPurchased}
                />
            )}

            {currentView === 'ingredients' && (
                <IngredientSelection
                    onBack={() => setCurrentView('shop')}
                    onCraftFood={handleCraftFood}
                    onNotification={onNotification}
                    walletAddress="demo-wallet"
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#e9f5e9',
    },
    navBar: {
        flexDirection: 'row',
        backgroundColor: '#e9f5e9',
        borderBottomWidth: 3,
        borderBottomColor: '#003300',
        padding: 8,
        paddingTop: 50, // Account for status bar
    },
    navButton: {
        flex: 1,
        backgroundColor: '#dbf3db',
        borderWidth: 2,
        borderColor: '#003300',
        borderRadius: 0,
        padding: 12,
        marginHorizontal: 4,
        alignItems: 'center',
        // Game Boy bevel effect
        borderTopColor: '#f0fff0',
        borderLeftColor: '#f0fff0',
        borderRightColor: '#006600',
        borderBottomColor: '#006600',
        shadowColor: '#001100',
        shadowOffset: { width: 1, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 0,
        elevation: 1,
    },
    activeNavButton: {
        backgroundColor: '#b8e6b8',
        // Pressed button effect
        borderTopColor: '#006600',
        borderLeftColor: '#006600',
        borderRightColor: '#f0fff0',
        borderBottomColor: '#f0fff0',
        shadowOffset: { width: -1, height: -1 },
    },
    navButtonText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#003300',
    },
    activeNavText: {
        color: '#002200',
    },
});

export default GameContainer;