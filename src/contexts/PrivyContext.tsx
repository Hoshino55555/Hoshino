import React, { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PrivyProvider } from '@privy-io/expo';

const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID;
const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID;

interface Props {
    children: ReactNode;
}

export const HoshinoPrivyProvider: React.FC<Props> = ({ children }) => {
    if (!PRIVY_APP_ID || !PRIVY_CLIENT_ID) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorTitle}>Privy not configured</Text>
                <Text style={styles.errorBody}>
                    Set {'\n'}
                    EXPO_PUBLIC_PRIVY_APP_ID {'\n'}
                    EXPO_PUBLIC_PRIVY_CLIENT_ID {'\n'}
                    in .env and rebuild the dev client. {'\n\n'}
                    Register at https://dashboard.privy.io to get these values.
                </Text>
            </View>
        );
    }

    return (
        <PrivyProvider
            appId={PRIVY_APP_ID}
            clientId={PRIVY_CLIENT_ID}
        >
            {children}
        </PrivyProvider>
    );
};

const styles = StyleSheet.create({
    errorContainer: {
        flex: 1,
        backgroundColor: '#1a1033',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    errorTitle: {
        color: '#ff6b9d',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
        textAlign: 'center',
        fontFamily: 'monospace',
    },
    errorBody: {
        color: '#e5dcf5',
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 20,
        fontFamily: 'monospace',
    },
});
