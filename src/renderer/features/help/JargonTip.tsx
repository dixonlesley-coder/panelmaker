/**
 * Inline "what's this?" helpers built on the plain-language {@link GLOSSARY}.
 *
 * `<JargonTip id="zs">Zs</JargonTip>` wraps an on-screen term with a subtle
 * dotted underline and a hover tooltip carrying the plain-English (or Bahasa
 * Indonesia) explanation. `<GlossaryInfo id="zs"/>` renders just a small info
 * icon with the same tooltip, for sitting next to a label.
 *
 * Both degrade gracefully: an unknown id renders the children unchanged (for
 * `JargonTip`) or nothing (for `GlossaryInfo`), so callers can sprinkle them in
 * without worrying about typos breaking the layout.
 */

import type { ReactNode } from 'react';
import { Box, Group, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';

import { glossaryLookup } from '@renderer/lib/glossary';

/** Which language the tooltip should speak. */
type Lang = 'en' | 'id';

/** Pick the right explanation for the chosen language, falling back to English. */
function explanationFor(id: string, lang: Lang | undefined): string | undefined {
  const entry = glossaryLookup(id);
  if (!entry) return undefined;
  if (lang === 'id' && entry.plainId) return entry.plainId;
  return entry.plain;
}

/** The shared tooltip body: the plain explanation with a small info icon. */
function TipLabel({ term, text }: { term: string; text: string }): ReactNode {
  return (
    <Group gap={6} align="flex-start" wrap="nowrap">
      <IconInfoCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <Box>
        <Text size="xs" fw={600}>
          {term}
        </Text>
        <Text size="xs">{text}</Text>
      </Box>
    </Group>
  );
}

/**
 * Wrap an on-screen term with a hover tooltip explaining it in plain language.
 * Renders {@link children} with a dotted underline and a help cursor. If the id
 * is unknown, the children are rendered unchanged (no tooltip, no underline).
 */
export function JargonTip({
  id,
  children,
  lang,
}: {
  id: string;
  children: ReactNode;
  lang?: Lang;
}): ReactNode {
  const entry = glossaryLookup(id);
  const text = explanationFor(id, lang);
  if (!entry || !text) return <>{children}</>;

  return (
    <Tooltip
      label={<TipLabel term={entry.term} text={text} />}
      withArrow
      withinPortal
      multiline
      w={280}
      events={{ hover: true, focus: true, touch: true }}
    >
      <Box
        component="span"
        style={{
          cursor: 'help',
          textDecorationLine: 'underline',
          textDecorationStyle: 'dotted',
          textUnderlineOffset: 2,
        }}
      >
        {children}
      </Box>
    </Tooltip>
  );
}

/**
 * A standalone info icon carrying the same plain-language tooltip — drop it
 * next to a label where you can't underline the text itself. Renders nothing
 * for an unknown id.
 */
export function GlossaryInfo({ id, lang }: { id: string; lang?: Lang }): ReactNode {
  const entry = glossaryLookup(id);
  const text = explanationFor(id, lang);
  if (!entry || !text) return null;

  return (
    <Tooltip
      label={<TipLabel term={entry.term} text={text} />}
      withArrow
      withinPortal
      multiline
      w={280}
      events={{ hover: true, focus: true, touch: true }}
    >
      <Box
        component="span"
        aria-label={entry.term}
        style={{ cursor: 'help', display: 'inline-flex', verticalAlign: 'middle', color: 'var(--mantine-color-dimmed)' }}
      >
        <IconInfoCircle size={15} />
      </Box>
    </Tooltip>
  );
}
