export const LOBE_THEME_PRIMARY_COLOR = 'LOBE_THEME_PRIMARY_COLOR';

export const LOBE_THEME_NEUTRAL_COLOR = 'LOBE_THEME_NEUTRAL_COLOR';

const FONT_EN = `"HarmonyOS Sans","Segoe UI","SF Pro Display",-apple-system,BlinkMacSystemFont,Roboto,Oxygen,Ubuntu,Cantarell,"Open Sans","Helvetica Neue",sans-serif`;
const FONT_CN = `"HarmonyOS Sans SC","PingFang SC","Hiragino Sans GB","Microsoft Yahei UI","Microsoft Yahei","Source Han Sans CN",sans-serif`;
const FONT_EMOJI = `"Segoe UI Emoji","Segoe UI Symbol","Apple Color Emoji","Twemoji Mozilla","Noto Color Emoji","Android Emoji"`;

/**
 * Geist only ships Latin glyphs, so CJK characters fall through to the
 * fallback chain, which mirrors the default `fontFamily` token of @lobehub/ui.
 */
export const UI_FONT_FAMILY = [`"Geist Variable"`, FONT_EN, FONT_CN, FONT_EMOJI].join(',');
