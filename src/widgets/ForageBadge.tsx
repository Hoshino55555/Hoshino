'use no memo';
// React 19's compiler memoizes components, but `react-native-android-widget`
// invokes widget components as raw functions when building the remote views
// tree. Disabling the compiler for this file keeps that contract intact.
import React from 'react';
import {
    FlexWidget,
    ImageWidget,
    OverlapWidget,
    TextWidget,
} from 'react-native-android-widget';
import { FONT_PIXEL, FORAGE_BAG } from './assets';
import { colors } from '../styles/tokens';

interface Props {
    count: number;
    // Compact shrinks every dimension so the bag fits next to a 2x2 stat
    // column. The non-compact variant is for Hero where there is room.
    compact?: boolean;
    // Pinned to the character whose snapshot drove this render. Embedded in
    // the deep-link URI so App can refuse to drain if the active character
    // has changed since the widget last refreshed (stale tap).
    characterId: string;
}

const ForageBadge: React.FC<Props> = ({ count, compact = false, characterId }) => {
    if (count <= 0) return null;
    const drainUri = `hoshino://forage/drain?characterId=${encodeURIComponent(characterId)}`;
    const bagSize = compact ? 48 : 68;
    const countSize = compact ? 20 : 26;
    const label = count > 99 ? '99+' : `${count}`;

    return (
        <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: drainUri }}
            style={{
                flexDirection: 'column',
                alignItems: 'center',
            }}
        >
            <OverlapWidget style={{ width: bagSize, height: bagSize }}>
                <ImageWidget
                    image={FORAGE_BAG}
                    imageWidth={bagSize}
                    imageHeight={bagSize}
                />
                <FlexWidget
                    style={{
                        width: countSize,
                        height: countSize,
                        marginLeft: bagSize - countSize,
                        backgroundColor: colors.goldBright,
                        borderRadius: countSize / 2,
                        borderWidth: 1,
                        borderColor: colors.purpleDark,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <TextWidget
                        text={label}
                        style={{
                            fontSize: compact ? 7 : 9,
                            color: colors.purpleDark,
                            fontFamily: FONT_PIXEL,
                        }}
                    />
                </FlexWidget>
            </OverlapWidget>
        </FlexWidget>
    );
};

export default ForageBadge;
