import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    ImageBackground,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ZoomOutOverlay from './ZoomOutOverlay';

interface GamesListProps {
    onClose: () => void;
    onSelectGame: (gameId: string) => void;
}

interface GameTile {
    id: string;
    name: string;
    description: string;
    available: boolean;
}

const GAMES: GameTile[] = [
    {
        id: 'starburst',
        name: 'STARBURST',
        description: 'Constellation puzzle',
        available: true,
    },
];

const GamesList: React.FC<GamesListProps> = ({ onClose, onSelectGame }) => {
    const insets = useSafeAreaInsets();
    const [isClosing, setIsClosing] = useState(false);
    const screenHeight = Dimensions.get('window').height;
    // The painted ARCADE banner sits at the top of the bg art; reserve roughly
    // a quarter of the screen so tiles don't crash into it.
    const bannerReserve = screenHeight * 0.25;

    const handleClose = () => {
        if (isClosing) return;
        setIsClosing(true);
    };

    const handleTilePress = (game: GameTile) => {
        if (!game.available) return;
        onSelectGame(game.id);
    };

    return (
        <ZoomOutOverlay exiting={isClosing} onExitComplete={onClose} backgroundColor="#1a1033">
            <ImageBackground
                source={require('../../assets/images/ARCADE-bg.png')}
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
                    <View style={styles.tileGrid}>
                        {GAMES.map((game) => (
                            <TouchableOpacity
                                key={game.id}
                                style={[styles.tile, !game.available && styles.tileDisabled]}
                                activeOpacity={game.available ? 0.8 : 1}
                                onPress={() => handleTilePress(game)}
                            >
                                <Text style={styles.tileName}>{game.name}</Text>
                                <Text style={styles.tileDescription}>{game.description}</Text>
                                {!game.available && (
                                    <Text style={styles.tileLockBadge}>SOON</Text>
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            </ImageBackground>
        </ZoomOutOverlay>
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
    tileGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 12,
    },
    tile: {
        width: '48%',
        backgroundColor: 'rgba(46, 90, 62, 0.85)',
        borderWidth: 2,
        borderColor: '#E8B84A',
        borderRadius: 8,
        padding: 12,
        alignItems: 'center',
        minHeight: 90,
        justifyContent: 'center',
    },
    tileDisabled: {
        opacity: 0.55,
    },
    tileName: {
        color: '#FFD700',
        fontFamily: 'PressStart2P',
        fontSize: 12,
        marginBottom: 6,
        textAlign: 'center',
    },
    tileDescription: {
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        fontSize: 8,
        textAlign: 'center',
        lineHeight: 12,
    },
    tileLockBadge: {
        marginTop: 6,
        color: '#FFB6C1',
        fontFamily: 'PressStart2P',
        fontSize: 8,
    },
});

export default GamesList;
