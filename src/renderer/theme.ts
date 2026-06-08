import { createTheme } from '@mantine/core';

/**
 * App theme. Uses system fonts only (fully offline — no web fonts/CDNs). The
 * `Inter` reference falls back to the platform UI font when Inter is absent.
 */
export const theme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
  fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  headings: {
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  },
});
