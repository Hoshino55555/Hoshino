'use no memo';
// React 19's compiler memoizes components, but `react-native-android-widget`
// invokes widget components as raw functions when building the remote views
// tree. Disabling the compiler for this file keeps that contract intact.
import React from 'react';
import { FlexWidget } from 'react-native-android-widget';
import FeedReadyBadge from './FeedReadyBadge';
import ForageBadge from './ForageBadge';
import { isFeedingReady } from './types';
import type { WidgetMoonokoSnapshot } from './types';

interface Props {
    snapshot: WidgetMoonokoSnapshot;
    compact?: boolean;
}

const WidgetActionBadges: React.FC<Props> = ({ snapshot, compact = false }) => {
    const showFeed = isFeedingReady(snapshot);
    const showForage = snapshot.foragedCount > 0;

    if (!showFeed && !showForage) return null;

    return (
        <FlexWidget
            style={{
                flexDirection: 'column',
                alignItems: 'flex-end',
            }}
        >
            {showFeed && (
                <FeedReadyBadge
                    compact={compact}
                    characterId={snapshot.characterId}
                />
            )}
            {showForage && (
                <FlexWidget style={{ marginTop: showFeed ? (compact ? 4 : 6) : 0 }}>
                    <ForageBadge
                        count={snapshot.foragedCount}
                        compact={compact}
                        characterId={snapshot.characterId}
                    />
                </FlexWidget>
            )}
        </FlexWidget>
    );
};

export default WidgetActionBadges;
