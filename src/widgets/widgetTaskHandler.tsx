'use no memo';
// React 19's compiler memoizes components, but `react-native-android-widget`
// invokes widget components as raw functions when building the remote views
// tree. Disabling the compiler for this file keeps that contract intact.
import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import CompactWidget from './CompactWidget';
import WideWidget from './WideWidget';
import HeroWidget from './HeroWidget';
import { loadCachedSnapshot } from './snapshotStore';

// Map of widget names (must match android/app/src/main/res/xml/*_info.xml)
// to the React component the runtime should render. The library passes
// `widgetInfo.widgetName` here whenever the launcher requests a re-render.
const widgetComponents = {
    HoshinoCompact: CompactWidget,
    HoshinoWide: WideWidget,
    HoshinoHero: HeroWidget,
} as const;

type WidgetName = keyof typeof widgetComponents;

// Entry point for every widget event (WIDGET_ADDED, WIDGET_UPDATE, click, etc.).
// We always render the latest cached snapshot — pushes from the JS side write
// fresh snapshots into MMKV/AsyncStorage; the launcher's periodic refresh
// reads whatever's there. The handler can't await async work for long, so we
// keep snapshot lookup synchronous (cached at module scope, refilled on every
// JS push).
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
    const widgetName = props.widgetInfo.widgetName as WidgetName;
    const Component = widgetComponents[widgetName];
    if (!Component) {
        // Unknown widget id — likely an outdated install. No-op rather than
        // throw so the system doesn't drop the widget into an error state.
        return;
    }

    switch (props.widgetAction) {
        case 'WIDGET_ADDED':
        case 'WIDGET_UPDATE':
        case 'WIDGET_RESIZED': {
            const snapshot = await loadCachedSnapshot();
            props.renderWidget(<Component snapshot={snapshot} />);
            break;
        }
        case 'WIDGET_DELETED':
            // Nothing to clean up — the JS-side store is shared across all
            // widget instances and harmless to keep.
            break;
        case 'WIDGET_CLICK':
            // OPEN_APP is configured at the FlexWidget level; this event
            // fires for any custom click actions we add later (e.g. a quick-
            // feed button on the wide variant). Until then, fall through.
            break;
        default:
            break;
    }
}
