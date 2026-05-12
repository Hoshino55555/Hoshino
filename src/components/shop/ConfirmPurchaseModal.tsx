import React from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Image,
    ImageBackground,
    ActivityIndicator,
} from 'react-native';
import { Frames, Stars } from '../../assets';
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
                <ImageBackground
                    source={Frames.purchaseModalBg}
                    style={styles.cardFramed}
                    imageStyle={styles.cardFramedBg}
                    resizeMode="stretch"
                >
                    <View style={styles.framedTop}>
                        <Text style={styles.framedTitle} numberOfLines={1}>
                            {item?.name}
                        </Text>
                        {item?.summary ? (
                            <Text style={styles.framedSummary} numberOfLines={1}>
                                {item.summary}
                            </Text>
                        ) : null}
                        <View style={styles.framedPriceRow}>
                            {isFree ? (
                                <Text style={styles.framedPrice}>FREE</Text>
                            ) : (
                                <>
                                    <Image
                                        source={Stars.fragment}
                                        style={styles.framedPriceIcon}
                                        resizeMode="contain"
                                    />
                                    <Text style={styles.framedPrice}>
                                        {item?.priceStarFragments ?? 0}
                                    </Text>
                                </>
                            )}
                        </View>
                    </View>
                    <TouchableOpacity
                        style={[styles.framedBtn, styles.framedBtnLeft]}
                        onPress={onCancel}
                        disabled={purchasing}
                    >
                        <Text style={styles.framedBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.framedBtn,
                            styles.framedBtnRight,
                            purchasing && styles.btnDisabled,
                        ]}
                        onPress={onConfirm}
                        disabled={purchasing}
                    >
                        {purchasing ? (
                            <View style={styles.processingRow}>
                                <ActivityIndicator
                                    size="small"
                                    color={terminalGreen.bgMid}
                                />
                                <Text style={styles.framedBtnText}>Processing…</Text>
                            </View>
                        ) : (
                            <Text style={styles.framedBtnText}>Buy</Text>
                        )}
                    </TouchableOpacity>
                </ImageBackground>
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
    cardFramed: {
        width: 320,
        height: 172,
    },
    cardFramedBg: {
        resizeMode: 'stretch',
    },
    framedTop: {
        position: 'absolute',
        top: 14,
        left: '6%',
        right: '6%',
        alignItems: 'center',
    },
    framedTitle: {
        fontFamily: fonts.body,
        fontSize: 26,
        color: terminalGreen.bgMid,
        textAlign: 'center',
    },
    framedSummary: {
        fontFamily: fonts.body,
        fontSize: 20,
        color: colors.slotInk,
        textAlign: 'center',
        marginTop: 3,
    },
    framedPriceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 5,
    },
    framedPriceIcon: {
        width: 20,
        height: 20,
        marginRight: 5,
    },
    framedPrice: {
        fontFamily: fonts.body,
        fontSize: 26,
        color: terminalGreen.bgMid,
    },
    framedBtn: {
        position: 'absolute',
        top: 95,
        height: 50,
        width: 130,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 14,
    },
    framedBtnLeft: {
        left: 20,
    },
    framedBtnRight: {
        right: 20,
    },
    framedBtnText: {
        fontFamily: fonts.body,
        fontSize: 28,
        color: terminalGreen.bgMid,
    },
    btnDisabled: {
        opacity: 0.5,
    },
    processingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
});

export default ConfirmPurchaseModal;
