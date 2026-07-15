/** Neon brand palette — mirrors frontend/src/styles/brand-tokens.css */

/** Primary accent — Material purple */
export const BRAND_PURPLE = '#6750A4';
export const BRAND_PERIWINKLE = '#EADDFF';
export const BRAND_CRIMSON = '#FF3B30';
export const BRAND_NEON_BLUE = '#2EC4F2';

/** Per-roster-index bubble + avatar tones (up to 9 concurrent personas). */
export const PARTICIPANT_PALETTE = [
  { color: '#6366F1', bg: '#EEF2FF' }, // indigo
  { color: '#059669', bg: '#ECFDF5' }, // emerald
  { color: '#D97706', bg: '#FFFBEB' }, // amber
  { color: '#DC2626', bg: '#FEE2E2' }, // red
  { color: '#0891B2', bg: '#ECFEFF' }, // cyan
  { color: '#7C3AED', bg: '#F5F3FF' }, // violet
  { color: '#0D9488', bg: '#F0FDFA' }, // teal
  { color: '#DB2777', bg: '#FDF2F8' }, // pink
  { color: '#65A30D', bg: '#F7FEE7' }, // lime
];

/** Human participant always green so they read as “you” vs AI personas. */
export const HUMAN_TONE = { color: '#16A34A', bg: '#F0FDF4' };

export const AVATAR_PALETTE = PARTICIPANT_PALETTE.map((t) => t.color);

export const HUMAN_COLOR = HUMAN_TONE.color;
