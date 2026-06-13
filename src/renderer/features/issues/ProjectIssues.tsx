import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, Card, Divider, Drawer, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCircleCheck, IconPointFilled, IconTool } from '@tabler/icons-react';
import type { SuggestedFix, SystemResult, Warning } from '@shared/types';
import { panelCompliance, type ComplianceItem } from '@shared/engine';
import { panelLabel } from '@shared/labels';
import { WarningBadge, severityColor } from '@renderer/features/components/WarningBadge';
import { useProjectStore } from '@renderer/state/projectStore';

/** Fix actions the store can apply automatically (the "safe" one-click fixes). */
const AUTO_FIX_ACTIONS = new Set(['set-cable', 'clear-breaker-override']);
const isAutoFix = (fix: SuggestedFix): boolean =>
  fix.action !== undefined && AUTO_FIX_ACTIONS.has(fix.action.type);

interface IssueRow {
  panelId?: string;
  group: string;
  warning: Warning;
}

/** One warning row with severity, code, message and its apply-able fixes. */
function IssueRowCard({ row }: { row: IssueRow }) {
  const { t } = useTranslation();
  const applyFix = useProjectStore((s) => s.applyFix);
  const w = row.warning;

  const onApply = (fix: SuggestedFix) => {
    if (!row.panelId || !w.circuitId) return;
    const handled = isAutoFix(fix);
    applyFix(row.panelId, w.circuitId, fix);
    notifications.show({
      title: handled ? t('issues.fixAppliedTitle') : t('issues.applyManuallyTitle'),
      message: handled ? fix.description : t('issues.applyManuallyBody'),
      color: handled ? 'teal' : 'gray',
    });
  };

  return (
    <Card
      withBorder
      radius="md"
      padding="xs"
      style={{ borderLeft: `3px solid var(--mantine-color-${severityColor(w.severity)}-6)` }}
    >
      <Group gap="xs" mb={2}>
        <WarningBadge severity={w.severity} />
        <Text size="xs" c="dimmed" ff="monospace">
          {w.code}
        </Text>
      </Group>
      <Text size="sm">{w.message}</Text>
      {w.fixes && w.fixes.length > 0 && (
        <Group gap="xs" mt="xs">
          {w.fixes.map((fix, i) => (
            <Button
              key={i}
              size="xs"
              variant="light"
              leftSection={<IconTool size={14} />}
              disabled={!row.panelId || !w.circuitId}
              onClick={() => onApply(fix)}
            >
              {t('issues.apply', { description: fix.description })}
            </Button>
          ))}
        </Group>
      )}
    </Card>
  );
}

/** A single compliance topic's icon, coloured by pass / fail / not-applicable. */
function ComplianceIcon({ status }: { status: ComplianceItem['status'] }) {
  if (status === 'pass') {
    return (
      <ThemeIcon size={16} radius="xl" variant="light" color="teal">
        <IconCircleCheck size={11} />
      </ThemeIcon>
    );
  }
  if (status === 'fail') {
    return (
      <ThemeIcon size={16} radius="xl" variant="light" color="orange">
        <IconAlertTriangle size={11} />
      </ThemeIcon>
    );
  }
  return (
    <ThemeIcon size={16} radius="xl" variant="subtle" color="gray">
      <IconPointFilled size={11} />
    </ThemeIcon>
  );
}

/**
 * The per-panel sign-off checklist (voltage drop, ADS, breaking capacity, busbar
 * withstand, protective conductor, ampacity) shown at the top of the drawer — the
 * engineering checks you sign off, separate from advisory warnings below.
 */
function ComplianceSection({ system }: { system: SystemResult }) {
  const { t } = useTranslation();
  const panels = system.order
    .map((id) => system.panels[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (panels.length === 0) return null;
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600} c="dimmed" tt="uppercase">
        {t('compliance.title')}
      </Text>
      {panels.map((p) => (
        <Card key={p.panelId} withBorder radius="md" padding="xs">
          <Text size="sm" fw={500} mb={6}>
            {panelLabel(p)}
          </Text>
          <Group gap="md">
            {panelCompliance(p).map((item) => (
              <Group key={item.key} gap={6} wrap="nowrap">
                <ComplianceIcon status={item.status} />
                <Text size="xs" c={item.status === 'fail' ? undefined : 'dimmed'}>
                  {t(`compliance.${item.key}`)}
                </Text>
              </Group>
            ))}
          </Group>
        </Card>
      ))}
    </Stack>
  );
}

/**
 * Project-wide validation: a per-panel sign-off checklist plus every panel's
 * warnings and the system-level ones, in one drawer grouped by panel, with a
 * "fix all safe issues" pass that applies every auto-applicable one-click fix at
 * once. The single status control in the header — its label reflects readiness.
 */
export function ProjectIssues({ system }: { system: SystemResult }) {
  const { t } = useTranslation();
  const applyFix = useProjectStore((s) => s.applyFix);
  const [open, setOpen] = useState(false);

  const rows = useMemo<IssueRow[]>(() => {
    const out: IssueRow[] = [];
    for (const id of system.order) {
      const p = system.panels[id];
      if (!p) continue;
      const group = panelLabel(p);
      for (const w of p.warnings) out.push({ panelId: p.panelId, group, warning: w });
    }
    for (const w of system.warnings) {
      out.push({ panelId: w.panelId, group: t('issues.systemGroup'), warning: w });
    }
    return out;
  }, [system, t]);

  const errors = rows.filter((r) => r.warning.severity === 'error').length;
  const warns = rows.filter((r) => r.warning.severity === 'warning').length;
  const infos = rows.filter((r) => r.warning.severity === 'info').length;
  const total = rows.length;

  // Rows whose fix the store can apply on its own (panel + circuit + a known action).
  const safe = rows.filter(
    (r) => r.panelId && r.warning.circuitId && (r.warning.fixes ?? []).some(isAutoFix),
  );

  const onFixAll = () => {
    let n = 0;
    for (const r of safe) {
      const fix = (r.warning.fixes ?? []).find(isAutoFix);
      if (fix && r.panelId && r.warning.circuitId) {
        applyFix(r.panelId, r.warning.circuitId, fix);
        n += 1;
      }
    }
    notifications.show({ title: t('issues.fixAllDone', { count: n }), message: '', color: n > 0 ? 'teal' : 'gray' });
  };

  const groups = useMemo(() => {
    const m = new Map<string, IssueRow[]>();
    for (const r of rows) {
      const a = m.get(r.group) ?? [];
      a.push(r);
      m.set(r.group, a);
    }
    return [...m.entries()];
  }, [rows]);

  const color = errors > 0 ? 'red' : warns > 0 ? 'orange' : 'teal';

  return (
    <>
      <Button
        size="xs"
        variant="light"
        color={color}
        leftSection={total > 0 ? <IconAlertTriangle size={14} /> : <IconCircleCheck size={14} />}
        rightSection={
          total > 0 ? (
            <Badge size="xs" circle variant="filled" color={color}>
              {total}
            </Badge>
          ) : undefined
        }
        onClick={() => setOpen(true)}
      >
        {total > 0 ? t('issues.projectIssues') : t('compliance.ready')}
      </Button>

      <Drawer
        opened={open}
        onClose={() => setOpen(false)}
        position="right"
        size="lg"
        keepMounted={false}
        title={
          <Group gap="xs">
            <ThemeIcon variant="light" color={color} size="sm">
              {total > 0 ? <IconAlertTriangle size={14} /> : <IconCircleCheck size={14} />}
            </ThemeIcon>
            <Text fw={600}>{t('issues.projectIssues')}</Text>
          </Group>
        }
      >
        <Stack gap="md">
          <ComplianceSection system={system} />
          {total === 0 ? (
            <Alert variant="light" color="teal" radius="md" icon={<IconCircleCheck size={18} />} title={t('issues.allClearTitle')}>
              {t('issues.allClearBody')}
            </Alert>
          ) : (
            <>
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm" c="dimmed">
                {t('issues.errors', { count: errors })} · {t('issues.warnings', { count: warns })}
                {infos > 0 ? ` · ${t('issues.infos', { count: infos })}` : ''}
              </Text>
              {safe.length > 0 && (
                <Button size="xs" leftSection={<IconTool size={14} />} onClick={onFixAll}>
                  {t('issues.fixAllSafe', { count: safe.length })}
                </Button>
              )}
            </Group>
            {groups.map(([g, list]) => (
              <div key={g}>
                <Divider label={g} labelPosition="left" mb="xs" />
                <Stack gap="xs">
                  {list.map((r, i) => (
                    <IssueRowCard key={`${g}-${r.warning.code}-${i}`} row={r} />
                  ))}
                </Stack>
              </div>
            ))}
            </>
          )}
        </Stack>
      </Drawer>
    </>
  );
}
