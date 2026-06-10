import { createTheme, rem } from '@mantine/core';

/**
 * PanelMaker design system.
 *
 * Goals: native-feeling, calm, precise — the platform UI font (SF Pro on macOS,
 * Segoe UI Variable on Windows), soft layered shadows, generous radii, quiet
 * borders, and consistent component defaults so every screen reads the same
 * without per-screen styling. Fully offline: system fonts only, no web fonts.
 */

/** Platform-native UI font stack (SF Pro / Segoe UI Variable / Roboto). */
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", Inter, Roboto, "Helvetica Neue", sans-serif';

/** Monospace stack for tags, order codes and engineering values. */
const MONO_STACK =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export const theme = createTheme({
  primaryColor: 'indigo',
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: 'md',
  cursorType: 'pointer',
  autoContrast: true,
  respectReducedMotion: true,

  fontFamily: FONT_STACK,
  fontFamilyMonospace: MONO_STACK,
  headings: {
    fontFamily: FONT_STACK,
    fontWeight: '650',
    sizes: {
      h1: { fontSize: rem(30), lineHeight: '1.2' },
      h2: { fontSize: rem(24), lineHeight: '1.25' },
      h3: { fontSize: rem(19), lineHeight: '1.3' },
      h4: { fontSize: rem(16), lineHeight: '1.35' },
    },
  },

  // Softer, larger-blur, lower-alpha shadows — depth without weight.
  shadows: {
    xs: '0 1px 2px rgba(16, 24, 40, 0.05)',
    sm: '0 1px 3px rgba(16, 24, 40, 0.07), 0 1px 2px rgba(16, 24, 40, 0.04)',
    md: '0 4px 12px rgba(16, 24, 40, 0.08), 0 1px 3px rgba(16, 24, 40, 0.05)',
    lg: '0 12px 24px rgba(16, 24, 40, 0.10), 0 2px 6px rgba(16, 24, 40, 0.05)',
    xl: '0 24px 48px rgba(16, 24, 40, 0.14), 0 4px 12px rgba(16, 24, 40, 0.06)',
  },

  components: {
    Card: {
      defaultProps: { radius: 'lg' },
    },
    Paper: {
      defaultProps: { radius: 'lg' },
    },
    Button: {
      defaultProps: { radius: 'md' },
      styles: { label: { fontWeight: 600 } },
    },
    ActionIcon: {
      defaultProps: { radius: 'md' },
    },
    Badge: {
      defaultProps: { radius: 'sm' },
      styles: { root: { textTransform: 'none', fontWeight: 600 } },
    },
    NavLink: {
      defaultProps: { variant: 'light' },
      styles: {
        root: { borderRadius: 'var(--mantine-radius-md)' },
        label: { fontWeight: 500 },
      },
    },
    Tooltip: {
      defaultProps: {
        openDelay: 350,
        radius: 'md',
        withArrow: true,
        transitionProps: { transition: 'fade', duration: 120 },
      },
    },
    Modal: {
      defaultProps: {
        radius: 'lg',
        centered: true,
        overlayProps: { backgroundOpacity: 0.45, blur: 6 },
        transitionProps: { transition: 'pop', duration: 200 },
        shadow: 'xl',
      },
      styles: { title: { fontWeight: 650 } },
    },
    Menu: {
      defaultProps: {
        radius: 'md',
        shadow: 'lg',
        transitionProps: { transition: 'fade-down', duration: 140 },
      },
    },
    Popover: {
      defaultProps: {
        radius: 'md',
        shadow: 'lg',
        transitionProps: { transition: 'fade-down', duration: 140 },
      },
    },
    Tabs: {
      styles: {
        tab: {
          fontWeight: 500,
          transition: 'background-color 140ms ease, color 140ms ease',
        },
      },
    },
    SegmentedControl: {
      defaultProps: { radius: 'md', transitionDuration: 200 },
    },
    Loader: {
      defaultProps: { type: 'dots' },
    },
    TextInput: { defaultProps: { radius: 'md' } },
    NumberInput: { defaultProps: { radius: 'md' } },
    Select: { defaultProps: { radius: 'md' } },
    Table: {
      styles: { th: { fontWeight: 600 } },
    },
    Notification: { defaultProps: { radius: 'md' } },
    Alert: { defaultProps: { radius: 'lg' } },
  },
});
