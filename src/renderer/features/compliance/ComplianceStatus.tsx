/**
 * Ambient compliance status — a single persistent pill in the canvas toolbar
 * that rolls up every panel's sign-off checklist (voltage drop, ADS/Zs,
 * breaking capacity, busbar withstand, protective conductor, ampacity). Green =
 * ready to issue; amber = items to resolve. Tap to see which panel and topic.
 *
 * Reads the already-computed system; the per-panel facts come from the pure
 * `panelCompliance` engine helper, so screen and PDF agree.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Group, Popover, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconCircleCheck, IconAlertTriangle } from '@tabler/icons-react';
import { panelCompliance, type ComplianceItem } from '@shared/engine';
import type { SystemResult } from '@shared/types/results';

interface PanelStatus {
  id: string;
  name: string;
  fails: ComplianceItem[];
}

export function ComplianceStatus({ system }: { system: SystemResult }) {
  const { t } = useTranslation();

  const panels = useMemo<PanelStatus[]>(() => {
    return system.order
      .map((id) => system.panels[id])
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({
        id: p.panelId,
        name: p.tag ? `${p.tag} — ${p.name}` : p.name,
        fails: panelCompliance(p).filter((i) => i.status === 'fail'),
      }));
  }, [system]);

  const failCount = panels.reduce((n, p) => n + p.fails.length, 0);
  const ok = failCount === 0;

  return (
    <Popover position="bottom-end" withinPortal shadow="md" width={320}>
      <Popover.Target>
        <UnstyledButton aria-label={t('compliance.title')}>
          <Badge
            size="lg"
            radius="sm"
            variant="light"
            color={ok ? 'teal' : 'orange'}
            leftSection={
              ok ? <IconCircleCheck size={14} /> : <IconAlertTriangle size={14} />
            }
            style={{ cursor: 'pointer', textTransform: 'none' }}
          >
            {ok ? t('compliance.ready') : t('compliance.toResolve', { count: failCount })}
          </Badge>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Text fw={600} size="sm">
            {t('compliance.title')}
          </Text>
          {ok ? (
            <Group gap="xs">
              <ThemeIcon size="sm" color="teal" variant="light">
                <IconCircleCheck size={14} />
              </ThemeIcon>
              <Text size="sm" c="dimmed">
                {t('compliance.allPass')}
              </Text>
            </Group>
          ) : (
            panels
              .filter((p) => p.fails.length > 0)
              .map((p) => (
                <Stack key={p.id} gap={2}>
                  <Text size="sm" fw={500}>
                    {p.name}
                  </Text>
                  {p.fails.map((f) => (
                    <Group key={f.key} gap={6} pl="xs" wrap="nowrap">
                      <ThemeIcon size={14} color="orange" variant="light">
                        <IconAlertTriangle size={10} />
                      </ThemeIcon>
                      <Text size="xs" c="dimmed">
                        {t(`compliance.${f.key}`)} — {t('compliance.failN', { count: f.failCount })}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              ))
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
