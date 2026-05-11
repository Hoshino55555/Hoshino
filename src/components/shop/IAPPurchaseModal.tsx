import React from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import type { ShopItem } from '../../data/shopCatalog';
import type { IAPPaymentToken } from '../../services/IAPService';
import { colors, fonts } from '../../styles/tokens';

// IAP payment token selector — three fixed options. Module scope so the
// `.map` source isn't a new array literal on every render.
const IAP_TOKENS: IAPPaymentToken[] = ['SOL', 'USDC', 'SKR'];

interface Props {
    item: ShopItem | null;
    token: IAPPaymentToken;
    onSelectToken: (token: IAPPaymentToken) => void;
    purchasing: boolean;
    signerConnected: boolean;
    walletSource: string | null | undefined;
    publicKey: string | null | undefined;
    onCancel: () => void;
    onPurchase: () => void;
    onFiatTopUp: () => void;
}

const IAPPurchaseModal: React.FC<Props> = ({
    item,
    token,
    onSelectToken,
    purchasing,
    signerConnected,
    walletSource,
    publicKey,
    onCancel,
    onPurchase,
    onFiatTopUp,
}) => (
    <Modal
        visible={item !== null}
        transparent
        animationType="fade"
        onRequestClose={onCancel}
    >
        <View style={styles.backdrop}>
            <View style={styles.card}>
                <Text style={styles.title}>{item?.name}</Text>
                {item?.summary ? (
                    <Text style={styles.summary}>{item.summary}</Text>
                ) : null}
                <Text style={styles.price}>
                    {item?.priceUsd != null ? `$${item.priceUsd.toFixed(2)} USD` : 'Coming Soon'}
                </Text>

                <Text style={styles.sectionLabel}>Pay with</Text>
                <View style={styles.railRow}>
                    {IAP_TOKENS.map((tk) => (
                        <TouchableOpacity
                            key={tk}
                            style={[
                                styles.railBtn,
                                token === tk && styles.railBtnActive,
                            ]}
                            onPress={() => onSelectToken(tk)}
                            disabled={purchasing}
                        >
                            <Text
                                style={[
                                    styles.railText,
                                    token === tk && styles.railTextActive,
                                ]}
                            >
                                {tk}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {!signerConnected ? (
                    <Text style={styles.note}>
                        Connect a wallet to purchase. Embedded users can also top up
                        with card via the button below.
                    </Text>
                ) : (
                    <Text style={styles.note}>
                        Signing wallet: {walletSource ?? 'unknown'} ·{' '}
                        {publicKey ? publicKey.slice(0, 4) + '…' + publicKey.slice(-4) : '—'}
                    </Text>
                )}

                {walletSource === 'embedded' && (
                    <TouchableOpacity
                        style={styles.topUpBtn}
                        onPress={onFiatTopUp}
                        disabled={purchasing}
                    >
                        <Text style={styles.topUpText}>
                            Top up with card (USDC)
                        </Text>
                    </TouchableOpacity>
                )}

                <View style={styles.buttonRow}>
                    <TouchableOpacity
                        style={[styles.btn, styles.cancelBtn]}
                        onPress={onCancel}
                        disabled={purchasing}
                    >
                        <Text style={styles.btnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.btn,
                            styles.buyBtn,
                            (!signerConnected || purchasing) && styles.btnDisabled,
                        ]}
                        onPress={onPurchase}
                        disabled={!signerConnected || purchasing}
                    >
                        {purchasing ? (
                            <View style={styles.processingRow}>
                                <ActivityIndicator
                                    size="small"
                                    color={colors.white}
                                />
                                <Text style={styles.btnText}>Processing…</Text>
                            </View>
                        ) : (
                            <Text style={styles.btnText}>
                                Buy with {token}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    </Modal>
);

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 380,
        backgroundColor: colors.purpleBg,
        borderColor: '#9C27B0',
        borderWidth: 2,
        borderRadius: 12,
        padding: 20,
    },
    title: {
        fontFamily: fonts.body,
        color: colors.white,
        fontSize: 33,
        textAlign: 'center',
        marginBottom: 4,
    },
    summary: {
        fontFamily: fonts.body,
        color: '#cfc4e6',
        fontSize: 24,
        textAlign: 'center',
        marginBottom: 8,
    },
    price: {
        fontFamily: fonts.body,
        color: colors.goldWarm,
        fontSize: 39,
        textAlign: 'center',
        marginBottom: 16,
    },
    sectionLabel: {
        fontFamily: fonts.body,
        color: '#bba8d6',
        fontSize: 21,
        marginBottom: 6,
        textTransform: 'uppercase',
    },
    railRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    railBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.purpleDark,
        alignItems: 'center',
    },
    railBtnActive: {
        borderColor: colors.goldWarm,
        backgroundColor: colors.purpleBg,
    },
    railText: { color: '#bba8d6', fontFamily: fonts.body },
    railTextActive: { color: colors.goldWarm },
    note: {
        fontFamily: fonts.body,
        color: '#a99fc4',
        fontSize: 21,
        textAlign: 'center',
        marginVertical: 10,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
    },
    btn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    cancelBtn: { backgroundColor: colors.purpleDark },
    buyBtn: { backgroundColor: '#7B3FB8' },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: colors.white, fontFamily: fonts.body },
    topUpBtn: {
        marginTop: 8,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.goldWarm,
        alignItems: 'center',
    },
    topUpText: { color: colors.goldWarm, fontFamily: fonts.body, fontSize: 24 },
    processingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
});

export default IAPPurchaseModal;
