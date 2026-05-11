import React from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Image,
    ActivityIndicator,
} from 'react-native';
import { Stars } from '../../assets';
import type { ShopItem } from '../../data/shopCatalog';
import { colors, terminalGreen, fonts } from '../../styles/tokens';

// Items that resolve as FREE (no Shards/IAP cost) and so render the price
// pill as a single FREE label instead of a fragment-priced row.
const FREE_ITEM_IDS = new Set(['daily-spin', 'hackathon-special']);

interface Props {
    item: ShopItem | null;
    purchasing: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

const ConfirmPurchaseModal: React.FC<Props> = ({ item, purchasing, onCancel, onConfirm }) => {
    const isFree = item != null && FREE_ITEM_IDS.has(item.id);
    return (
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
                    <View style={styles.priceRow}>
                        {isFree ? (
                            <Text style={styles.price}>FREE</Text>
                        ) : (
                            <>
                                <Image
                                    source={Stars.fragment}
                                    style={styles.priceIcon}
                                    resizeMode="contain"
                                />
                                <Text style={styles.price}>
                                    {item?.priceStarFragments ?? 0}
                                </Text>
                            </>
                        )}
                    </View>
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
                                purchasing && styles.btnDisabled,
                            ]}
                            onPress={onConfirm}
                            disabled={purchasing}
                        >
                            {purchasing ? (
                                <View style={styles.processingRow}>
                                    <ActivityIndicator
                                        size="small"
                                        color={colors.white}
                                    />
                                    <Text style={[styles.btnText, styles.buyBtnText]}>
                                        Processing…
                                    </Text>
                                </View>
                            ) : (
                                <Text style={[styles.btnText, styles.buyBtnText]}>
                                    Buy
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: colors.mintPale,
        borderWidth: 3,
        borderColor: terminalGreen.bgMid,
        borderTopColor: terminalGreen.accent,
        borderLeftColor: terminalGreen.accent,
        borderRightColor: terminalGreen.bgDeep,
        borderBottomColor: terminalGreen.bgDeep,
        padding: 18,
        alignItems: 'center',
    },
    title: {
        fontFamily: fonts.body,
        fontSize: 30,
        color: terminalGreen.bgMid,
        textAlign: 'center',
        marginBottom: 6,
    },
    summary: {
        fontFamily: fonts.body,
        fontSize: 21,
        color: colors.slotInk,
        textAlign: 'center',
        marginBottom: 10,
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    priceIcon: {
        width: 22,
        height: 22,
        marginRight: 6,
    },
    price: {
        fontFamily: fonts.body,
        fontSize: 33,
        color: terminalGreen.bgMid,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 8,
        width: '100%',
    },
    btn: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 2,
    },
    cancelBtn: {
        backgroundColor: colors.mintPale,
        borderColor: terminalGreen.bgMid,
    },
    buyBtn: {
        backgroundColor: terminalGreen.accent,
        borderColor: terminalGreen.bgMid,
        borderTopColor: terminalGreen.ok,
        borderLeftColor: terminalGreen.ok,
        borderRightColor: '#004400',
        borderBottomColor: '#002200',
    },
    btnDisabled: {
        opacity: 0.5,
    },
    btnText: {
        fontFamily: fonts.body,
        fontSize: 24,
        color: terminalGreen.bgMid,
    },
    buyBtnText: {
        color: colors.white,
    },
    processingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
});

export default ConfirmPurchaseModal;
