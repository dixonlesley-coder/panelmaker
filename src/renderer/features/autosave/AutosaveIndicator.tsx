import { useEffect, useState } from 'react';
import { Badge, Group, Loader, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconCloudOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { AutosaveTarget } from '@renderer/lib/autosave';
import type { SaveState } from './useAutosave';

/** A coarse "Ns / Nm / Nh ago" string — fine enough for an autosave hint. */
function relativeAgo(t: TFunction, savedAt: number, now: number): string {
  const sec = Math.max(0, Math.round((now - savedAt) / 1000));
  if (sec < 5) return t('autosave.agoJustNow');
  if (sec < 60) return t('autosave.agoSeconds', { n: sec });
  const min = Math.round(sec / 60);
  if (min < 60) return t('autosave.agoMinutes', { n: min });
  return t('autosave.agoHours', { n: Math.round(min / 60) });
}

/** Compact header indicator for autosave state. */
export function AutosaveIndicator({
  saveState,
  target,
  savedAt,
}: {
  saveState: SaveState;
  target: AutosaveTarget;
  savedAt?: number | null;
}) {
  const { t } = useTranslation();
  const where = target === 'desktop' ? t('autosave.targetDesktop') : t('autosave.targetWeb');

  // Re-tick while a save timestamp is showing so the "Nm ago" tooltip stays
  // current even if the user opens it minutes later (cheap — one tiny node).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (saveState !== 'saved' || !savedAt) return;
    const id = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(id);
  }, [saveState, savedAt]);

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
    const tip = savedAt
      ? t('autosave.savedTipTime', { ago: relativeAgo(t, savedAt, now), where })
      : t('autosave.savedTip', { where });
    return (
      <Tooltip label={tip}>
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
