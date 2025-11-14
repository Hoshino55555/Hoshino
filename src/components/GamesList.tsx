import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';

interface GamesListProps {
    visible: boolean;
    onClose: () => void;
    onSelectGame: (gameId: string) => void;
}

const GamesList: React.FC<GamesListProps> = ({ visible, onClose, onSelectGame }) => {
    const games = [
        { id: 'starburst', name: 'Starburst', description: 'A logic puzzle game' }
    ];

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <TouchableOpacity
                        style={styles.modalCloseButton}
                        onPress={onClose}
                    >
                        <Text style={styles.modalCloseText}>✕</Text>
                    </TouchableOpacity>

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
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#E8F5E8',
        borderRadius: 20,
        padding: 20,
        margin: 20,
        maxWidth: '90%',
        minWidth: 300,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    modalCloseButton: {
        position: 'absolute',
        top: 10,
        right: 15,
        zIndex: 1,
        width: 30,
        height: 30,
        borderRadius: 4,
        backgroundColor: '#2E5A3E',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#2E5A3E',
    },
    modalCloseText: {
        fontSize: 18,
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        transform: [{ translateY: -1 }],
    },
    title: {
        fontSize: 24,
        color: '#2E5A3E',
        marginBottom: 20,
        fontFamily: 'PressStart2P',
        textAlign: 'center',
    },
    gamesList: {
        width: '100%',
    },
    gameButton: {
        backgroundColor: '#2E5A3E',
        borderRadius: 10,
        padding: 15,
        marginBottom: 10,
        borderWidth: 2,
        borderColor: '#2E5A3E',
    },
    gameName: {
        fontSize: 16,
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        marginBottom: 5,
        textAlign: 'center',
    },
    gameDescription: {
        fontSize: 10,
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        textAlign: 'center',
        opacity: 0.8,
    },
});

export default GamesList;

