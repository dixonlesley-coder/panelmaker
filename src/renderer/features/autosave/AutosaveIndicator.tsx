import { Badge, Group, Loader, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconCloudOff } from '@tabler/icons-react';
import type { AutosaveTarget } from '@renderer/lib/autosave';
import type { SaveState } from './useAutosave';

/** Compact header indicator for autosave state. */
export function AutosaveIndicator({ saveState, target }: { saveState: SaveState; target: AutosaveTarget }) {
  const where = target === 'desktop' ? 'the local database' : 'this browser';

  if (saveState === 'saving') {
    return (
      <Group gap={6} wrap="nowrap">
        <Loader size={12} />
        <Text size="xs" c="dimmed" visibleFrom="sm">
          Saving…
        </Text>
      </Group>
    );
  }
  if (saveState === 'error') {
    return (
      <Tooltip label="Autosave failed — your last change may not be saved">
        <Badge size="sm" variant="light" color="red" leftSection={<IconCloudOff size={12} />}>
          Not saved
        </Badge>
      </Tooltip>
    );
  }
  if (saveState === 'saved') {
    return (
      <Tooltip label={`Autosaved to ${where}`}>
        <Group gap={4} c="dimmed" wrap="nowrap">
          <IconCheck size={13} />
          <Text size="xs" visibleFrom="sm">
            Saved
          </Text>
        </Group>
      </Tooltip>
    );
  }
  return null;
}
