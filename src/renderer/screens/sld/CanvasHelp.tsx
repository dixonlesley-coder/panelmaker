import { useTranslation } from 'react-i18next';
import { ActionIcon, Group, Popover, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconArrowsLeftRight,
  IconBackspace,
  IconBolt,
  IconClick,
  IconCopy,
  IconDragDrop,
  IconHelp,
  IconPlugConnected,
  IconPointer,
  IconZoomIn,
} from '@tabler/icons-react';

/**
 * Floating "?" guide for the single-line canvas. The canvas packs a lot of
 * direct-manipulation gestures (double-click to edit, right-click to swap parts,
 * drag to feed/wire, Delete to disconnect, …) that aren't otherwise discoverable;
 * this popover lists them so a new user isn't left guessing.
 */
const HELP_ITEMS: { icon: React.ReactNode; key: string }[] = [
  { icon: <IconClick size={14} />, key: 'system.helpEdit' },
  { icon: <IconPointer size={14} />, key: 'system.helpSwap' },
  { icon: <IconDragDrop size={14} />, key: 'system.helpPalette' },
  { icon: <IconPlugConnected size={14} />, key: 'system.helpFeed' },
  { icon: <IconBolt size={14} />, key: 'system.helpLoad' },
  { icon: <IconClick size={14} />, key: 'system.helpCable' },
  { icon: <IconBackspace size={14} />, key: 'system.helpDelete' },
  { icon: <IconCopy size={14} />, key: 'system.helpCopy' },
  { icon: <IconArrowsLeftRight size={14} />, key: 'system.helpReorder' },
  { icon: <IconZoomIn size={14} />, key: 'system.helpZoom' },
];

export function CanvasHelp() {
  const { t } = useTranslation();
  return (
    <Popover width={310} position="bottom-end" withinPortal shadow="md" radius="md">
      <Popover.Target>
        <ActionIcon variant="default" size="lg" radius="xl" aria-label={t('system.helpTitle')}>
          <IconHelp size={18} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p="sm">
        <Text fw={700} size="sm" mb={8}>
          {t('system.helpTitle')}
        </Text>
        <Stack gap={7}>
          {HELP_ITEMS.map((it) => (
            <Group key={it.key} gap={8} wrap="nowrap" align="flex-start">
              <ThemeIcon size="sm" variant="light" color="indigo" style={{ flexShrink: 0 }}>
                {it.icon}
              </ThemeIcon>
              <Text size="xs" style={{ lineHeight: 1.35 }}>
                {t(it.key)}
              </Text>
            </Group>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
