import { Badge, Group, Loader, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconCloudOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { AutosaveTarget } from '@renderer/lib/autosave';
import type { SaveState } from './useAutosave';

/** Compact header indicator for autosave state. */
export function AutosaveIndicator({ saveState, target }: { saveState: SaveState; target: AutosaveTarget }) {
  const { t } = useTranslation();
  const where = target === 'desktop' ? t('autosave.targetDesktop') : t('autosave.targetWeb');

  if (saveState === 'saving') {
    return (
      <Group gap={6} wrap="nowrap">
        <Loader size={12} />
        <Text size="xs" c="dimmed" visibleFrom="sm">
          {t('autosave.saving')}
        </Text>
      </Group>
    );
  }
  if (saveState === 'error') {
    return (
      <Tooltip label={t('autosave.failedTip')}>
        <Badge size="sm" variant="light" color="red" leftSection={<IconCloudOff size={12} />}>
          {t('autosave.notSaved')}
        </Badge>
      </Tooltip>
    );
  }
  if (saveState === 'saved') {
    return (
      <Tooltip label={t('autosave.savedTip', { where })}>
        <Group gap={4} c="dimmed" wrap="nowrap">
          <IconCheck size={13} />
          <Text size="xs" visibleFrom="sm">
            {t('autosave.saved')}
          </Text>
        </Group>
      </Tooltip>
    );
  }
  return null;
}
