import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import InnerScreen from './InnerScreen';

interface GamesListProps {
    onClose: () => void;
    onSelectGame: (gameId: string) => void;
}

const GamesList: React.FC<GamesListProps> = ({ onClose, onSelectGame }) => {
    const [isClosing, setIsClosing] = useState(false);

    const games = [
        { id: 'starburst', name: 'Starburst', description: 'A logic puzzle game' },
    ];

    const handleClose = () => {
        if (isClosing) return;
        setIsClosing(true);
    };

    return (
        <InnerScreen
            expanded
            animateIn
            exiting={isClosing}
            onExitComplete={onClose}
            leftButtonText="BACK"
            centerButtonText=""
            rightButtonText=""
            onLeftButtonPress={handleClose}
        >
            <View style={styles.content}>
                <Text style={styles.title}>Games</Text>

                <View style={styles.gamesList}>
                    {games.map((game) => (
                        <TouchableOpacity
                            key={game.id}
                            style={styles.gameButton}
                            onPress={() => onSelectGame(game.id)}
                        >
                            <Text style={styles.gameName}>{game.name}</Text>
                            <Text style={styles.gameDescription}>{game.description}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </InnerScreen>
    );
};

const styles = StyleSheet.create({
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingVertical: 16,
        paddingHorizontal: 12,
    },
    title: {
        fontSize: 18,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
        marginBottom: 20,
        textAlign: 'center',
    },
    gamesList: {
        width: '100%',
    },
    gameButton: {
        backgroundColor: '#2E5A3E',
        borderRadius: 8,
        padding: 14,
        marginBottom: 10,
        borderWidth: 2,
        borderColor: '#2E5A3E',
    },
    gameName: {
        fontSize: 14,
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        marginBottom: 4,
        textAlign: 'center',
    },
    gameDescription: {
        fontSize: 9,
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        textAlign: 'center',
        opacity: 0.8,
    },
});

export default GamesList;
