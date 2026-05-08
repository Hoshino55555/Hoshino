import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    ImageBackground,
    Image,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backgrounds } from '../assets';

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
    const screenWidth = Dimensions.get('window').width;
    // Top banner is 1200×805, bottom strip is 1200×284 — reserves derived from
    // screen width so the layered overlays render at native aspect. Matches
    // Shop / FeedingPage so all menu screens share the same banner-anchored grid.
    const bannerReserve = screenWidth * (805 / 1200);
    const bottomBarReserve = screenWidth * (284 / 1200);

    const handleTilePress = (game: GameTile) => {
        if (!game.available) return;
        onSelectGame(game.id);
    };

    return (
        <View style={StyleSheet.absoluteFill}>
            <ImageBackground
                source={Backgrounds.arcade}
                style={styles.bg}
                resizeMode="cover"
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
                </View>

                <View
                    pointerEvents="none"
                    style={[styles.bottomOverlay, { height: bottomBarReserve }]}
                >
                    <Image
                        source={Backgrounds.arcadeBottom}
                        style={styles.overlayImage}
                        resizeMode="contain"
                    />
                </View>
                <View
                    pointerEvents="none"
                    style={[styles.bannerOverlay, { top: 0, height: bannerReserve }]}
                >
                    <Image
                        source={Backgrounds.arcadeBanner}
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
                        onPress={onClose}
                        hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                    >
                        <Text style={styles.backButtonText}>{'<'} Back</Text>
                    </TouchableOpacity>
                </View>
            </ImageBackground>
        </View>
    );
};

const styles = StyleSheet.create({
    bg: { flex: 1, width: '100%', height: '100%' },
    // Sits in the painted plank baked into the bottom of the new ARCADE bg.
    // Absolute so the scroll content above isn't shifted — paddingBottom on
    // the scroll view already reserves the matching space.
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
        fontFamily: 'Monaco',
        fontSize: 14,
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
        fontFamily: 'Monaco',
        fontSize: 17,
        marginBottom: 6,
        textAlign: 'center',
    },
    tileDescription: {
        color: '#E8F5E8',
        fontFamily: 'Monaco',
        fontSize: 11,
        textAlign: 'center',
        lineHeight: 12,
    },
    tileLockBadge: {
        marginTop: 6,
        color: '#FFB6C1',
        fontFamily: 'Monaco',
        fontSize: 11,
    },
});

export default GamesList;
