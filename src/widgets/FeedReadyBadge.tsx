'use no memo';
// React 19's compiler memoizes components, but `react-native-android-widget`
// invokes widget components as raw functions when building the remote views
// tree. Disabling the compiler for this file keeps that contract intact.
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { FONT_PIXEL } from './assets';

interface Props {
    compact?: boolean;
    characterId: string;
}

const FeedReadyBadge: React.FC<Props> = ({ compact = false, characterId }) => {
    const feedUri = `hoshino://route/feeding?characterId=${encodeURIComponent(characterId)}`;

    return (
        <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: feedUri }}
            style={{
                backgroundColor: '#FFB347',
                borderColor: '#3A225E',
                borderWidth: 1,
                borderRadius: compact ? 10 : 13,
                paddingHorizontal: compact ? 7 : 10,
                paddingVertical: compact ? 4 : 6,
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <TextWidget
                text="FEED"
                style={{
                    color: '#3A225E',
                    fontFamily: FONT_PIXEL,
                    fontSize: compact ? 7 : 10,
                }}
            />
        </FlexWidget>
    );
};

export default FeedReadyBadge;
