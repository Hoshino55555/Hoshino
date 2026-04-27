// Maps `WidgetSnapshot.avatarKey` to the bundled drawable each widget renders.
// `react-native-android-widget` requires require()'d images at build time —
// the runtime can't resolve them dynamically the way RN's Image does. So we
// keep an explicit table here; adding a new moonoko means one new line.
//
// Static PNG mirrors of the in-app GIFs live next to the existing animations.
// Widgets can't render animated GIFs reliably across launchers, so we pair
// each animation with a still frame at assets/images/widget/<NAME>.png.

const AVATAR_MAP: Record<string, ReturnType<typeof require>> = {
    LYRA: require('../../assets/images/widget/LYRA.png'),
    ORION: require('../../assets/images/widget/ORION.png'),
    ARO: require('../../assets/images/widget/ARO.png'),
    SIRIUS: require('../../assets/images/widget/SIRIUS.png'),
    ZANIAH: require('../../assets/images/widget/ZANIAH.png'),
    EMPTY: require('../../assets/images/widget/EMPTY.png'),
};

export function resolveAvatar(key: string) {
    return AVATAR_MAP[key] ?? AVATAR_MAP.EMPTY;
}

// Backgrounds are pre-cropped to the widget's actual aspect ratio. Android
// cells on Seeker are portrait (taller than wide), so the 2x2 and 4x4 tiles
// are tall rectangles, not squares.
export const WIDGET_BG_COMPACT = require('../../assets/images/widget/widget-bg-compact.png');
export const WIDGET_BG_HERO = require('../../assets/images/widget/widget-bg-hero.png');
export const WIDGET_BG_WIDE = require('../../assets/images/widget/widget-bg-wide.png');

// Same star sprites the in-app stat readout uses, mirrored into the widget
// asset folder so the widget can require() them at build time.
export const STAR_FILLED = require('../../assets/images/widget/star_filled.png');
export const STAR_EMPTY = require('../../assets/images/widget/star_empty.png');

// Ingredient sprites for the forage pile. Mirrors the three placeholder
// foragables in `ForagePopOut`. The widget cycles through these by index so
// the pile looks like a mix of finds without the snapshot having to carry
// per-item metadata.
export const FORAGE_SPRITES = [
    require('../../assets/images/widget/forage_berry.png'),
    require('../../assets/images/widget/forage_egg.png'),
    require('../../assets/images/widget/forage_sugar.png'),
];

// Filename prefix is what `react-native-android-widget` resolves at runtime
// (see ResourceUtils.findAssetFont). Defining the names here keeps every
// widget pointing at the same TTFs.
export const FONT_PIXEL = 'PressStart2P-Regular';
export const FONT_BODY = 'SpaceMono-Regular';

// Stat color-coding shared across all variants so a glance maps to the same
// reading: pink = mood, amber = hunger, sky = energy.
export const STAT_COLORS = {
    mood: '#FF69B4',
    hunger: '#FFB347',
    energy: '#87CEEB',
} as const;
