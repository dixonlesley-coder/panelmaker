import { Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { WarningSeverity } from '@shared/types';

const SEVERITY_COLOR: Record<WarningSeverity, string> = {
  info: 'blue',
  warning: 'yellow',
  error: 'red',
};

const SEVERITY_KEY: Record<WarningSeverity, string> = {
  info: 'issues.severityInfo',
  warning: 'issues.severityWarning',
  error: 'issues.severityError',
};

/** A colored badge reflecting a warning's severity. */
export function WarningBadge({ severity }: { severity: WarningSeverity }) {
  const { t } = useTranslation();
  return (
    <Badge color={SEVERITY_COLOR[severity]} variant="light" size="sm">
      {t(SEVERITY_KEY[severity])}
    </Badge>
  );
}

/** Resolve the Mantine color for a severity (for reuse outside the badge). */
export function severityColor(severity: WarningSeverity): string {
  return SEVERITY_COLOR[severity];
}
