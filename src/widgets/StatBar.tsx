'use no memo';
// React 19's compiler memoizes components, but `react-native-android-widget`
// invokes widget components as raw functions when building the remote views
// tree. Disabling the compiler for this file keeps that contract intact.
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { FONT_PIXEL } from './assets';

interface StatBarProps {
    label: string;
    value: number;
    color: string;
    width: number;
    // Compact tiles can't fit the full label; they get a single colored letter
    // instead so the stat is still identifiable at a glance.
    short?: string;
    showLabel?: boolean;
}

const STAT_BG = 'rgba(13, 15, 46, 0.85)';
const STAT_BORDER = 'rgba(255, 215, 0, 0.4)';

const StatBar: React.FC<StatBarProps> = ({
    label,
    value,
    color,
    width,
    short,
    showLabel = true,
}) => {
    const clamped = Math.max(0, Math.min(100, value));
    const filled = Math.round((clamped / 100) * width);
    const empty = Math.max(0, width - filled);
    const labelText = short ?? label;

    return (
        <FlexWidget
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 3,
            }}
        >
            {showLabel && (
                <TextWidget
                    text={labelText}
                    style={{
                        fontSize: 7,
                        color,
                        fontFamily: FONT_PIXEL,
                        width: short ? 10 : 32,
                        marginRight: 4,
                    }}
                />
            )}
            <FlexWidget
                style={{
                    flexDirection: 'row',
                    height: 8,
                    width,
                    backgroundColor: STAT_BG,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: STAT_BORDER,
                }}
            >
                {filled > 0 && (
                    <FlexWidget
                        style={{
                            width: filled,
                            height: 6,
                            backgroundColor: color,
                            borderRadius: 3,
                        }}
                    />
                )}
                {empty > 0 && <FlexWidget style={{ width: empty, height: 6 }} />}
            </FlexWidget>
        </FlexWidget>
    );
};

export default StatBar;
