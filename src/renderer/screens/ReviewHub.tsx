/**
 * The "Review" hub — one destination that tabs over the read/analyse screens
 * (system overview, 24-hour dashboard, protection coordination, energy sources),
 * so the sidebar collapses to a few primary destinations instead of a long list.
 *
 * The active tab is the canonical `activeScreen`, so deep links (command palette,
 * internal navigation) open the right tab and the sidebar highlight stays in step.
 */

import { useTranslation } from 'react-i18next';
import { Tabs } from '@mantine/core';
import { IconInfoSquareRounded, IconGauge, IconChartLine, IconSolarPanel } from '@tabler/icons-react';
import { useProjectStore, type Screen } from '@renderer/state/projectStore';
import { SystemInfo } from '@renderer/screens/SystemInfo';
import { Dashboard } from '@renderer/screens/Dashboard';
import { Coordination } from '@renderer/screens/Coordination';
import { Sources } from '@renderer/screens/Sources';

/** Sub-screens that live under the Review hub, in tab order. */
export const REVIEW_SCREENS: Screen[] = ['overview', 'dashboard', 'coordination', 'sources'];

export function ReviewHub() {
  const { t } = useTranslation();
  const activeScreen = useProjectStore((s) => s.activeScreen);
  const setScreen = useProjectStore((s) => s.setScreen);
  const value = REVIEW_SCREENS.includes(activeScreen) ? activeScreen : 'overview';

  return (
    <Tabs value={value} onChange={(v) => v && setScreen(v as Screen)} keepMounted={false}>
      <Tabs.List mb="md">
        <Tabs.Tab value="overview" leftSection={<IconInfoSquareRounded size={15} />}>
          {t('nav.overview')}
        </Tabs.Tab>
        <Tabs.Tab value="dashboard" leftSection={<IconGauge size={15} />}>
          {t('nav.dashboard')}
        </Tabs.Tab>
        <Tabs.Tab value="coordination" leftSection={<IconChartLine size={15} />}>
          {t('nav.coordination')}
        </Tabs.Tab>
        <Tabs.Tab value="sources" leftSection={<IconSolarPanel size={15} />}>
          {t('nav.sources')}
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="overview"><SystemInfo /></Tabs.Panel>
      <Tabs.Panel value="dashboard"><Dashboard /></Tabs.Panel>
      <Tabs.Panel value="coordination"><Coordination /></Tabs.Panel>
      <Tabs.Panel value="sources"><Sources /></Tabs.Panel>
    </Tabs>
  );
}
