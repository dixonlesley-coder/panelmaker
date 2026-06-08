import { Alert, Button, Card, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCircleCheck, IconTool } from '@tabler/icons-react';
import type { PanelResult, SuggestedFix, Warning } from '@shared/types';
import { WarningBadge, severityColor } from '@renderer/features/components/WarningBadge';
import { useProjectStore } from '@renderer/state/projectStore';

/** One warning card with severity badge, message and any apply-able fixes. */
function IssueCard({ panelId, warning }: { panelId: string; warning: Warning }) {
  const applyFix = useProjectStore((s) => s.applyFix);

  const onApply = (fix: SuggestedFix) => {
    if (!warning.circuitId) return;
    applyFix(panelId, warning.circuitId, fix);
    notifications.show({
      title: 'Fix applied',
      message: fix.description,
      color: 'teal',
    });
  };

  return (
    <Card withBorder radius="md" padding="sm" style={{ borderLeft: `3px solid var(--mantine-color-${severityColor(warning.severity)}-6)` }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Group gap="xs" mb={2}>
            <WarningBadge severity={warning.severity} />
            <Text size="xs" c="dimmed" ff="monospace">
              {warning.code}
            </Text>
          </Group>
          <Text size="sm">{warning.message}</Text>
        </div>
      </Group>

      {warning.fixes && warning.fixes.length > 0 && (
        <Group gap="xs" mt="sm">
          {warning.fixes.map((fix, i) => (
            <Button
              key={i}
              size="xs"
              variant="light"
              leftSection={<IconTool size={14} />}
              disabled={!warning.circuitId}
              onClick={() => onApply(fix)}
            >
              Apply: {fix.description}
            </Button>
          ))}
        </Group>
      )}
    </Card>
  );
}

/** Lists every warning for the active panel, with one-click fixes. */
export function IssuesPanel({ result }: { result: PanelResult }) {
  const warnings = result.warnings;

  if (warnings.length === 0) {
    return (
      <Alert
        variant="light"
        color="teal"
        radius="md"
        icon={<IconCircleCheck size={18} />}
        title="No issues"
      >
        Every circuit in this panel passes the protection, ampacity and voltage-drop checks.
      </Alert>
    );
  }

  const errors = warnings.filter((w) => w.severity === 'error').length;
  const warns = warnings.filter((w) => w.severity === 'warning').length;
  const infos = warnings.filter((w) => w.severity === 'info').length;

  return (
    <Stack gap="sm">
      <Group gap="xs">
        <ThemeIcon variant="light" color="orange" size="md" radius="md">
          <IconTool size={16} />
        </ThemeIcon>
        <Text size="sm" c="dimmed">
          {errors} error{errors === 1 ? '' : 's'} · {warns} warning{warns === 1 ? '' : 's'}
          {infos > 0 ? ` · ${infos} info` : ''}
        </Text>
      </Group>

      {warnings.map((w, i) => (
        <IssueCard key={`${w.code}-${w.circuitId ?? ''}-${i}`} panelId={result.panelId} warning={w} />
      ))}
    </Stack>
  );
}
