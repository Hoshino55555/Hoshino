import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Frames } from '../assets';

interface Props {
    onBack: () => void;
    onNotification?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    playerName?: string;
    publicKey?: string | null;
    email?: string | null;
    walletSource?: string | null;
    onUpdatePlayerName?: (name: string) => void;
    onLogout?: () => void;
}

const formatWalletSource = (source?: string | null) => {
    if (!source) return 'Not connected';
    switch (source) {
        case 'mwa': return 'Mobile Wallet Adapter';
        case 'phantom': return 'Phantom';
        case 'backpack': return 'Backpack';
        case 'embedded': return 'Privy embedded';
        default: return source;
    }
};

const Profile: React.FC<Props> = ({
    onBack,
    onNotification,
    playerName,
    publicKey,
    email,
    walletSource,
    onUpdatePlayerName,
    onLogout,
}) => {
    const [nameDraft, setNameDraft] = useState(playerName ?? '');
    const insets = useSafeAreaInsets();

    useEffect(() => {
        setNameDraft(playerName ?? '');
    }, [playerName]);

    const savedName = (playerName ?? '').trim();
    const draftName = nameDraft.trim();
    const nameDirty = draftName !== savedName;

    const handleSaveName = () => {
        if (!onUpdatePlayerName || !nameDirty) return;
        if (!draftName) {
            onNotification?.('Name cannot be empty', 'warning');
            return;
        }
        onUpdatePlayerName(draftName);
        onNotification?.('Name updated', 'success');
    };

    const handleLogout = () => {
        if (!onLogout) return;
        Alert.alert('Log out', 'Disconnect your wallet and sign out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: () => onLogout() },
        ]);
    };

    return (
        <View style={[styles.safeArea, { backgroundColor: '#E8F5E8' }]} testID="profile-screen">
                <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
                    <TouchableOpacity style={styles.backButton} onPress={onBack} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                        <Image
                            source={Frames.backButton}
                            style={styles.backButtonImage}
                            resizeMode="contain"
                        />
                        <Text style={styles.backButtonLabel}>Back</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}>
                    <Text style={styles.title}>Profile</Text>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Display Name</Text>
                        <View style={styles.nameRow}>
                            <TextInput
                                style={styles.nameInput}
                                value={nameDraft}
                                onChangeText={setNameDraft}
                                placeholder="Your name"
                                placeholderTextColor="rgba(46, 90, 62, 0.5)"
                                maxLength={24}
                                autoCorrect={false}
                            />
                            <TouchableOpacity
                                style={[styles.saveButton, !nameDirty && styles.saveButtonDisabled]}
                                onPress={handleSaveName}
                                disabled={!nameDirty}
                            >
                                <Text style={styles.saveButtonText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Wallet</Text>
                        <Text style={styles.fieldLabel}>Address</Text>
                        <Text style={styles.addressText} selectable>
                            {publicKey ?? 'Not connected'}
                        </Text>
                        <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Source</Text>
                        <Text style={styles.valueText}>{formatWalletSource(walletSource)}</Text>
                    </View>

                    {email && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Account</Text>
                            <Text style={styles.fieldLabel}>Email</Text>
                            <Text style={styles.valueText} selectable>{email}</Text>
                        </View>
                    )}

                    {onLogout && (
                        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} testID="profile-logout">
                            <Text style={styles.logoutButtonText}>Log out</Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    topBar: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
        flexDirection: 'row',
        alignItems: 'center',
    },
    backButton: {
        padding: 4,
        alignItems: 'center',
    },
    backButtonImage: {
        width: 56,
        height: 46,
    },
    backButtonLabel: {
        color: '#e84a4a',
        fontFamily: 'Monaco',
        fontSize: 14,
        marginTop: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
    },
    scrollContent: {
        paddingVertical: 12,
        paddingBottom: 40,
    },
    title: {
        fontSize: 38,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
        textAlign: 'center',
        marginBottom: 18,
    },
    section: {
        marginBottom: 16,
        backgroundColor: '#f0fff0',
        borderRadius: 8,
        padding: 14,
        borderWidth: 2,
        borderColor: '#2E5A3E',
    },
    sectionTitle: {
        fontSize: 26,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
        marginBottom: 10,
    },
    fieldLabel: {
        fontSize: 20,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
        opacity: 0.75,
        marginBottom: 4,
    },
    fieldLabelSpaced: {
        marginTop: 10,
    },
    valueText: {
        fontSize: 23,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
        lineHeight: 15,
    },
    addressText: {
        fontSize: 15,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
        lineHeight: 14,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
    },
    nameInput: {
        flex: 1,
        backgroundColor: '#E8F5E8',
        borderWidth: 1,
        borderColor: '#2E5A3E',
        borderRadius: 4,
        paddingHorizontal: 10,
        paddingVertical: 8,
        color: '#2E5A3E',
        fontSize: 23,
        fontFamily: 'Monaco',
        marginRight: 8,
    },
    saveButton: {
        backgroundColor: '#2E5A3E',
        paddingHorizontal: 14,
        justifyContent: 'center',
        borderRadius: 4,
    },
    saveButtonDisabled: {
        opacity: 0.4,
    },
    saveButtonText: {
        color: '#E8F5E8',
        fontSize: 21,
        fontFamily: 'Monaco',
    },
    logoutButton: {
        backgroundColor: '#8B2E2E',
        paddingVertical: 14,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#E8F5E8',
        alignItems: 'center',
        marginTop: 8,
    },
    logoutButtonText: {
        color: '#E8F5E8',
        fontSize: 23,
        fontFamily: 'Monaco',
    },
});

export default Profile;
