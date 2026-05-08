import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Switch,
    StyleSheet,
    ScrollView,
    Alert,
    Image,
    PanResponder,
    Animated,
    ImageBackground,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SettingsService, { MenuButton, type SoundLevel } from '../services/SettingsService';
import { Menu, Backgrounds } from '../assets';

interface Props {
    onBack: () => void;
    onNotification?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    onSettingsChanged?: () => void;
}

const Settings: React.FC<Props> = ({ onBack, onNotification, onSettingsChanged }) => {
    const insets = useSafeAreaInsets();
    const screenHeight = Dimensions.get('window').height;
    const bannerReserve = screenHeight * 0.27;
    const bottomBarReserve = screenHeight * 0.10;
    const [settingsService] = useState(() => SettingsService.getInstance());
    const [menuButtons, setMenuButtons] = useState<MenuButton[]>([]);
    const [soundLevel, setSoundLevelState] = useState<SoundLevel>(3);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [theme, setTheme] = useState('default');
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [menuExpanded, setMenuExpanded] = useState(false);
    const panRefs = useRef<{ [key: string]: Animated.Value }>({});

    useEffect(() => {
        menuButtons.forEach(button => {
            if (!panRefs.current[button.id]) {
                panRefs.current[button.id] = new Animated.Value(0);
            }
        });
    }, [menuButtons]);

    const getImageSource = (iconName: string) =>
        (Menu as Record<string, ReturnType<typeof require>>)[iconName] ?? Menu.settings;

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        await settingsService.initialize();
        const buttons = settingsService.getMenuButtons();
        setMenuButtons(buttons);
        setSoundLevelState(settingsService.getSoundLevel());
        setNotificationsEnabled(settingsService.isNotificationsEnabled());
        setTheme(settingsService.getTheme());
    };

    const resetToDefault = async () => {
        Alert.alert(
            'Reset Settings',
            'Are you sure you want to reset all settings to default?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                        await settingsService.resetMenuButtons();
                        await loadSettings();
                        onNotification?.('Settings reset to default', 'success');
                    }
                }
            ]
        );
    };

    const updateSoundLevel = async (level: SoundLevel) => {
        await settingsService.setSoundLevel(level);
        setSoundLevelState(level);
    };

    const updateNotificationSetting = async (enabled: boolean) => {
        await settingsService.setNotificationsEnabled(enabled);
        setNotificationsEnabled(enabled);
        onNotification?.(`Notifications ${enabled ? 'enabled' : 'disabled'}`, 'success');
    };

    const updateTheme = async (newTheme: string) => {
        await settingsService.setTheme(newTheme);
        setTheme(newTheme);
        onNotification?.(`Theme changed to ${newTheme}`, 'success');
    };

    return (
        <View style={{ flex: 1, backgroundColor: '#1a1033' }}>
            <ImageBackground source={Backgrounds.settings} style={styles.bg} resizeMode="cover" testID="settings-screen">
                <View
                    style={[
                        styles.scrollClipper,
                        {
                            marginTop: bannerReserve + insets.top,
                            marginBottom: bottomBarReserve,
                        },
                    ]}
                >
                <ScrollView
                    style={styles.content}
                    contentContainerStyle={[
                        styles.scrollContent,
                        { paddingBottom: insets.bottom + 16 },
                    ]}
                    showsVerticalScrollIndicator={false}
                >
                <View style={styles.section}>
                    <TouchableOpacity
                        style={styles.collapseHeader}
                        onPress={() => setMenuExpanded((v) => !v)}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.sectionTitle}>Menu Buttons</Text>
                        <Text style={styles.collapseChevron}>{menuExpanded ? '−' : '+'}</Text>
                    </TouchableOpacity>

                    {menuExpanded && (
                        <>
                    <Text style={styles.sectionDescription}>
                        Drag to reorder which buttons appear in the interaction menu.
                    </Text>

                    <View style={styles.miniMenuPreview}>
                        <View style={styles.miniMenuBar}>
                            <View style={styles.miniMenuRow}>
                                {menuButtons.slice(0, 4).map((button) => (
                                    <View key={`preview-${button.id}`} style={styles.miniButton}>
                                        <Image source={getImageSource(button.icon)} style={styles.miniButtonImage} />
                                    </View>
                                ))}
                            </View>
                            {menuButtons.length > 4 && (
                                <View style={styles.miniMenuRow}>
                                    {menuButtons.slice(4, 8).map((button) => (
                                        <View key={`preview-${button.id}`} style={styles.miniButton}>
                                            <Image source={getImageSource(button.icon)} style={styles.miniButtonImage} />
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    </View>

                    {menuButtons.map((button, index) => {
                        const pan = panRefs.current[button.id];

                        const panResponder = PanResponder.create({
                            onStartShouldSetPanResponder: () => true,
                            onPanResponderGrant: () => {
                                setDraggedIndex(index);
                                pan?.setValue(0);
                            },
                            onPanResponderMove: (_evt, gestureState) => {
                                if (pan) {
                                    pan.setValue(gestureState.dy);
                                    const itemHeight = 60;
                                    const dragDistance = gestureState.dy;
                                    const threshold = itemHeight;

                                    if (Math.abs(dragDistance) > threshold) {
                                        const targetIndex = Math.max(0, Math.min(menuButtons.length - 1,
                                            index + Math.round(dragDistance / itemHeight)));

                                        if (targetIndex !== index) {
                                            const newMenuButtons = [...menuButtons];
                                            const [movedItem] = newMenuButtons.splice(index, 1);
                                            newMenuButtons.splice(targetIndex, 0, movedItem);
                                            setMenuButtons(newMenuButtons);
                                            setDraggedIndex(targetIndex);
                                        }
                                    }
                                }
                            },
                            onPanResponderRelease: () => {
                                if (pan) {
                                    menuButtons.forEach((btn, idx) => {
                                        btn.order = idx;
                                    });

                                    settingsService.setMenuButtons(menuButtons);
                                    onSettingsChanged?.();
                                    onNotification?.(`Moved ${button.name}`, 'success');

                                    Animated.spring(pan, {
                                        toValue: 0,
                                        useNativeDriver: false,
                                    }).start();
                                }
                                setDraggedIndex(null);
                            },
                        });

                        return (
                            <Animated.View
                                key={button.id}
                                style={[
                                    styles.buttonRow,
                                    draggedIndex === index && styles.draggedItem,
                                    {
                                        transform: pan ? [{ translateY: pan }] : [],
                                        elevation: draggedIndex === index ? 10 : 0,
                                        zIndex: draggedIndex === index ? 1000 : 1,
                                    }
                                ]}
                                {...panResponder.panHandlers}
                            >
                                <View style={styles.dragHandle}>
                                    <Text style={styles.dragHandleText}>⋮⋮</Text>
                                </View>
                                <Image source={getImageSource(button.icon)} style={styles.buttonIcon} />
                                <View style={styles.buttonInfo}>
                                    <Text style={styles.buttonName}>{button.name}</Text>
                                </View>
                            </Animated.View>
                        );
                    })}

                    <TouchableOpacity style={styles.resetButton} onPress={resetToDefault}>
                        <Text style={styles.resetButtonText}>Reset to Default</Text>
                    </TouchableOpacity>
                        </>
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>General</Text>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Volume</Text>
                        <View style={styles.volumeRow}>
                            <TouchableOpacity
                                style={[
                                    styles.volumeMute,
                                    soundLevel === 0 && styles.volumeMuteActive,
                                ]}
                                onPress={() => updateSoundLevel(0)}
                                activeOpacity={0.7}
                            >
                                <Text
                                    style={[
                                        styles.volumeMuteText,
                                        soundLevel === 0 && styles.volumeMuteTextActive,
                                    ]}
                                >
                                    OFF
                                </Text>
                            </TouchableOpacity>
                            <View style={styles.volumeBarTrack}>
                                {[1, 2, 3, 4].map((level) => {
                                    const filled = soundLevel >= level;
                                    return (
                                        <TouchableOpacity
                                            key={level}
                                            onPress={() => updateSoundLevel(level as SoundLevel)}
                                            activeOpacity={0.6}
                                            style={styles.volumeBarHit}
                                            hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
                                        >
                                            <View
                                                style={[
                                                    styles.volumeBar,
                                                    { height: 8 + level * 5 },
                                                    filled && styles.volumeBarFilled,
                                                ]}
                                            />
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Notifications</Text>
                        <Switch
                            value={notificationsEnabled}
                            onValueChange={updateNotificationSetting}
                            trackColor={{ false: '#767577', true: '#81b0ff' }}
                            thumbColor={notificationsEnabled ? '#f5dd4b' : '#f4f3f4'}
                        />
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Theme</Text>

                    <View style={styles.themeButtons}>
                        {(['default', 'mint', 'dark'] as const).map((t) => (
                            <TouchableOpacity
                                key={t}
                                style={[styles.themeButton, theme === t && styles.activeThemeButton]}
                                onPress={() => updateTheme(t)}
                            >
                                <Text style={[styles.themeButtonText, theme === t && styles.activeThemeButtonText]}>
                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
                </ScrollView>
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
                        onPress={onBack}
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
    bg: {
        flex: 1,
    },
    scrollClipper: {
        flex: 1,
        overflow: 'hidden',
    },
    bottomBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'flex-start',
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
        fontSize: 14,
        color: '#E8F5E8',
        fontFamily: 'Monaco',
    },
    content: {
        flex: 1,
        paddingHorizontal: 12,
    },
    scrollContent: {
        paddingVertical: 12,
        paddingBottom: 20,
    },
    title: {
        fontSize: 22,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
        textAlign: 'center',
        marginBottom: 14,
    },
    section: {
        marginBottom: 16,
        backgroundColor: '#f0fff0',
        borderRadius: 6,
        padding: 12,
        borderWidth: 2,
        borderColor: '#2E5A3E',
    },
    sectionTitle: {
        fontSize: 17,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
        marginBottom: 6,
    },
    collapseHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    collapseChevron: {
        fontSize: 22,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
        marginBottom: 6,
        paddingHorizontal: 6,
    },
    volumeRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    volumeMute: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 2,
        borderColor: '#2E5A3E',
        backgroundColor: '#f0fff0',
        marginRight: 8,
    },
    volumeMuteActive: {
        backgroundColor: '#2E5A3E',
    },
    volumeMuteText: {
        color: '#2E5A3E',
        fontFamily: 'Monaco',
        fontSize: 12,
        letterSpacing: 1,
    },
    volumeMuteTextActive: {
        color: '#f0fff0',
    },
    volumeBarTrack: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        height: 36,
        paddingHorizontal: 4,
        paddingBottom: 4,
        borderWidth: 2,
        borderColor: '#2E5A3E',
        backgroundColor: '#f0fff0',
    },
    volumeBarHit: {
        justifyContent: 'flex-end',
        alignSelf: 'stretch',
        paddingHorizontal: 3,
    },
    volumeBar: {
        width: 8,
        backgroundColor: '#d4ead4',
        borderWidth: 1,
        borderColor: '#2E5A3E',
    },
    volumeBarFilled: {
        backgroundColor: '#2E5A3E',
    },
    sectionDescription: {
        fontSize: 13,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
        marginBottom: 12,
        opacity: 0.75,
        lineHeight: 14,
    },
    buttonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#2E5A3E',
        backgroundColor: '#f0fff0',
    },
    buttonInfo: {
        flex: 1,
        marginLeft: 12,
    },
    buttonName: {
        fontSize: 15,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
    },
    dragHandle: {
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#d4f5c4',
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#2E5A3E',
    },
    dragHandleText: {
        fontSize: 15,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
    },
    buttonIcon: {
        width: 20,
        height: 20,
        resizeMode: 'contain',
        marginLeft: 8,
    },
    draggedItem: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        backgroundColor: '#f0fff0',
    },
    resetButton: {
        backgroundColor: '#2E5A3E',
        padding: 10,
        borderRadius: 4,
        alignItems: 'center',
        marginTop: 12,
    },
    resetButtonText: {
        color: '#E8F5E8',
        fontSize: 14,
        fontFamily: 'Monaco',
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    settingLabel: {
        fontSize: 15,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
    },
    themeButtons: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 4,
    },
    themeButton: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: '#2E5A3E',
        backgroundColor: '#E8F5E8',
    },
    activeThemeButton: {
        backgroundColor: '#2E5A3E',
    },
    themeButtonText: {
        fontSize: 14,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
    },
    activeThemeButtonText: {
        color: '#E8F5E8',
    },
    miniMenuPreview: {
        marginBottom: 12,
        padding: 6,
        backgroundColor: '#f0fff0',
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#2E5A3E',
    },
    miniMenuBar: {
        backgroundColor: '#E8F5E8',
        borderRadius: 3,
        padding: 4,
        borderWidth: 1,
        borderColor: '#2E5A3E',
    },
    miniMenuRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 1,
    },
    miniButton: {
        flex: 1,
        backgroundColor: '#d4f5c4',
        padding: 2,
        marginHorizontal: 1,
        borderRadius: 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#2E5A3E',
        width: 20,
        height: 20,
    },
    miniButtonImage: {
        width: 12,
        height: 12,
        resizeMode: 'contain',
    },
});

export default Settings;
