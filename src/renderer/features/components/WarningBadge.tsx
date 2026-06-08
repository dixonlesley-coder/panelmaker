import { Badge } from '@mantine/core';
import type { WarningSeverity } from '@shared/types';

const SEVERITY_COLOR: Record<WarningSeverity, string> = {
  info: 'blue',
  warning: 'yellow',
  error: 'red',
};

/** A colored badge reflecting a warning's severity. */
export function WarningBadge({ severity }: { severity: WarningSeverity }) {
  return (
    <Badge color={SEVERITY_COLOR[severity]} variant="light" size="sm">
      {severity}
    </Badge>
  );
}

/** Resolve the Mantine color for a severity (for reuse outside the badge). */
export function severityColor(severity: WarningSeverity): string {
  return SEVERITY_COLOR[severity];
}
