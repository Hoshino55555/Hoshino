// Shared style fragments — composed into per-component StyleSheet.create
// blocks. Lives here when a fragment recurs across files and serves the
// same purpose. Page-local one-offs stay inline.

import { StyleSheet, type ViewStyle } from 'react-native';

// "Clip the scroll content to the painted cavity." Absolute-positioned
// fill of the parent with overflow:hidden so a ScrollView underneath
// can't bleed past the painted frame's borderRadius. Used by every
// in-cavity scrolling page (Shop / Inventory / Feeding / GamesList /
// Settings). Inset via `top`/`bottom` at the call site when the page
// reserves room for a fixed header/footer.
export const scrollClipperFill: ViewStyle = {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
};
