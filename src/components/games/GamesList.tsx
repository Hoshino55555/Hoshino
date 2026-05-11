import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FooterBackBar from './FooterBackBar';
import PageArtShell from './PageArtShell';
import { Backgrounds } from '../assets';

export type ArcadeGameId = 'starburst' | 'water-ring-toss';

interface GamesListProps {
    onClose: () => void;
    onSelectGame: (gameId: ArcadeGameId) => void;
}

interface GameTile {
    id: ArcadeGameId;
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
    {
        id: 'water-ring-toss',
        name: 'RING TOSS',
        description: 'Water jet arcade',
        available: true,
    },
];

const GamesList: React.FC<GamesListProps> = ({ onClose, onSelectGame }) => {
    const insets = useSafeAreaInsets();
    const { width: screenWidth } = useWindowDimensions();
    // Top banner is 1200×805, bottom strip is 1200×284 — reserves derived from
    // screen width so the layered overlays render at native aspect. Matches
    // Shop / FeedingPage so all menu screens share the same banner-anchored grid.
    const bannerReserve = screenWidth * (805 / 1200);
    const bottomBarReserve = screenWidth * (284 / 1200);
    const contentTopPadding = bannerReserve * 1.03 + insets.top;
    const contentBottomPadding =
        bottomBarReserve * 1.17 + insets.bottom;

    const handleTilePress = (game: GameTile) => {
        if (!game.available) return;
        onSelectGame(game.id);
    };

    return (
        <PageArtShell
            background={Backgrounds.arcade}
            testID="games-screen"
            style={StyleSheet.absoluteFill}
            overlays={[
                {
                    key: 'bottom',
                    source: Backgrounds.arcadeBottom,
                    edge: 'bottom',
                    height: bottomBarReserve,
                },
                {
                    key: 'banner',
                    source: Backgrounds.arcadeBanner,
                    edge: 'top',
                    height: bannerReserve,
                },
            ]}
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
                                paddingTop: contentTopPadding,
                                paddingBottom: contentBottomPadding,
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

                <FooterBackBar
                    onBack={onClose}
                    height={bottomBarReserve}
                    bottomInset={insets.bottom}
                />
        </PageArtShell>
    );
};

const styles = StyleSheet.create({
    scrollClipper: {
        position: 'absolute',
        left: 0,
        right: 0,
        overflow: 'hidden',
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
        fontSize: 26,
        marginBottom: 6,
        textAlign: 'center',
    },
    tileDescription: {
        color: '#E8F5E8',
        fontFamily: 'Monaco',
        fontSize: 17,
        textAlign: 'center',
        lineHeight: 12,
    },
    tileLockBadge: {
        marginTop: 6,
        color: '#FFB6C1',
        fontFamily: 'Monaco',
        fontSize: 17,
    },
});

export default GamesList;
