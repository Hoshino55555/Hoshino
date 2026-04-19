import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet, ScrollView, Alert, Image, PanResponder, Animated } from 'react-native';
import SettingsService, { MenuButton } from '../services/SettingsService';
import InnerScreen from './InnerScreen';

interface Props {
    onBack: () => void;
    onCloseStart?: () => void;
    onNotification?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    onSettingsChanged?: () => void;
}

const Settings: React.FC<Props> = ({ onBack, onCloseStart, onNotification, onSettingsChanged }) => {
    const [settingsService] = useState(() => SettingsService.getInstance());
    const [menuButtons, setMenuButtons] = useState<MenuButton[]>([]);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [theme, setTheme] = useState('default');
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [isClosing, setIsClosing] = useState(false);
    const panRefs = useRef<{ [key: string]: Animated.Value }>({});

    useEffect(() => {
        menuButtons.forEach(button => {
            if (!panRefs.current[button.id]) {
                panRefs.current[button.id] = new Animated.Value(0);
            }
        });
    }, [menuButtons]);

    const getImageSource = (iconName: string) => {
        switch (iconName) {
            case 'feed': return require('../../assets/images/feed.png');
            case 'chat': return require('../../assets/images/chat.png');
            case 'games': return require('../../assets/images/games.png');
            case 'sleep': return require('../../assets/images/sleepzzzz.png');
            case 'shop': return require('../../assets/images/shop.png');
            case 'inventory': return require('../../assets/images/backpack.png');
            case 'gallery': return require('../../assets/images/gallery.png');
            case 'settings': return require('../../assets/images/settings.png');
            default: return require('../../assets/images/settings.png');
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const handleClose = () => {
        if (isClosing) return;
        setIsClosing(true);
        onCloseStart?.();
    };

    const loadSettings = async () => {
        await settingsService.initialize();
        const buttons = settingsService.getMenuButtons();
        setMenuButtons(buttons);
        setSoundEnabled(settingsService.isSoundEnabled());
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

    const updateSoundSetting = async (enabled: boolean) => {
        await settingsService.setSoundEnabled(enabled);
        setSoundEnabled(enabled);
        onNotification?.(`Sound ${enabled ? 'enabled' : 'disabled'}`, 'success');
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
        <InnerScreen
            expanded
            animateIn
            exiting={isClosing}
            onExitComplete={onBack}
            showBackgroundImage={false}
            leftButtonText=""
            centerButtonText=""
            rightButtonText=""
            onLeftButtonPress={handleClose}
        >
            <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>Settings</Text>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Menu Buttons</Text>
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

                                    settingsService.settings.menuButtons = menuButtons;
                                    settingsService.saveSettings();
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
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>General</Text>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Sound</Text>
                        <Switch
                            value={soundEnabled}
                            onValueChange={updateSoundSetting}
                            trackColor={{ false: '#767577', true: '#81b0ff' }}
                            thumbColor={soundEnabled ? '#f5dd4b' : '#f4f3f4'}
                        />
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
        </InnerScreen>
    );
};

const styles = StyleSheet.create({
    content: {
        flex: 1,
        paddingHorizontal: 12,
    },
    scrollContent: {
        paddingVertical: 12,
        paddingBottom: 20,
    },
    title: {
        fontSize: 16,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
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
        fontSize: 12,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
        marginBottom: 6,
    },
    sectionDescription: {
        fontSize: 9,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
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
        fontSize: 11,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
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
        fontSize: 11,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
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
        fontSize: 10,
        fontFamily: 'PressStart2P',
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    settingLabel: {
        fontSize: 11,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
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
        fontSize: 10,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
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
