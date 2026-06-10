import { useEffect, useState } from 'react';
import { Button, CloseButton, Group, Paper, Progress, Text, ThemeIcon } from '@mantine/core';
import { IconAlertTriangle, IconArrowUp } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { UpdateStatus } from '@shared/ipc-contract';
import { installUpdate, isDesktop, onUpdateStatus } from '@renderer/api';

/**
 * Floating banner that surfaces auto-update progress and offers "Restart &
 * update" once a release is downloaded. Renders nothing in the web build.
 */
export function UpdateNotifier() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isDesktop()) return;
    return onUpdateStatus((s) => {
      setStatus(s);
      // Re-show the banner only on a genuinely new event (an update appearing or
      // finishing download) — not on every progress tick or a transient error,
      // so dismissing it stays dismissed mid-download.
      if (s.state === 'available' || s.state === 'downloaded') setDismissed(false);
    });
  }, []);

  if (!status || dismissed) return null;
  const show =
    status.state === 'available' ||
    status.state === 'downloading' ||
    status.state === 'downloaded' ||
    status.state === 'error';
  if (!show) return null;

  const title =
    status.state === 'downloaded'
      ? t('update.ready')
      : status.state === 'error'
        ? t('update.error')
        : t('update.updating');

  return (
    <Paper
      shadow="md"
      withBorder
      radius="md"
      p="sm"
      style={{ position: 'fixed', right: 16, bottom: 16, width: 320, zIndex: 1000 }}
    >
      <Group justify="space-between" mb={6} wrap="nowrap">
        <Group gap={6}>
          <ThemeIcon size="sm" variant="light" color={status.state === 'error' ? 'red' : 'indigo'}>
            {status.state === 'error' ? <IconAlertTriangle size={14} /> : <IconArrowUp size={14} />}
          </ThemeIcon>
          <Text size="sm" fw={600}>
            {title}
          </Text>
        </Group>
        <CloseButton size="sm" onClick={() => setDismissed(true)} />
      </Group>

      {status.state === 'available' && (
        <Text size="xs" c="dimmed">
          {t('update.found', { version: status.version })}
        </Text>
      )}
      {status.state === 'downloading' && (
        <>
          <Text size="xs" c="dimmed" mb={4}>
            {t('update.downloadingPct', { percent: status.percent })}
          </Text>
          <Progress value={status.percent} size="sm" />
        </>
      )}
      {status.state === 'downloaded' && (
        <Group justify="space-between" align="center" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {t('update.readyToInstall', { version: status.version })}
          </Text>
          <Button size="xs" onClick={() => void installUpdate()}>
            {t('update.restartAndUpdate')}
          </Button>
        </Group>
      )}
      {status.state === 'error' && (
        <Text size="xs" c="red">
          {status.message}
        </Text>
      )}
    </Paper>
  );
}
