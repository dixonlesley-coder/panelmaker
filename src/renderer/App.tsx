import { AppShell, Group, NavLink, Title, ActionIcon, Tooltip, Text, useMantineColorScheme, useComputedColorScheme } from '@mantine/core';
import {
  IconSun,
  IconMoon,
  IconSitemap,
  IconGauge,
  IconAdjustmentsBolt,
  IconBox,
  IconReceipt,
  IconSolarPanel,
  IconSettings,
  IconBolt,
} from '@tabler/icons-react';

import { useProjectStore, type Screen } from '@renderer/state/projectStore';
import { SystemView } from '@renderer/screens/SystemView';
import { Dashboard } from '@renderer/screens/Dashboard';
import { PanelEditor } from '@renderer/screens/PanelEditor';
import { PartsCatalog } from '@renderer/screens/PartsCatalog';
import { Pricelist } from '@renderer/screens/Pricelist';
import { Sources } from '@renderer/screens/Sources';
import { Settings } from '@renderer/screens/Settings';

interface NavItem {
  screen: Screen;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { screen: 'system', label: 'System', icon: <IconSitemap size={18} /> },
  { screen: 'dashboard', label: 'Dashboard', icon: <IconGauge size={18} /> },
  { screen: 'panel', label: 'Panel Editor', icon: <IconAdjustmentsBolt size={18} /> },
  { screen: 'parts', label: 'Parts Catalog', icon: <IconBox size={18} /> },
  { screen: 'pricelist', label: 'Pricelist', icon: <IconReceipt size={18} /> },
  { screen: 'sources', label: 'Energy Sources', icon: <IconSolarPanel size={18} /> },
  { screen: 'settings', label: 'Settings', icon: <IconSettings size={18} /> },
];

/** Toggle between light and dark color schemes. */
function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = computed === 'dark';
  return (
    <Tooltip label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <ActionIcon
        variant="default"
        size="lg"
        aria-label="Toggle color scheme"
        onClick={() => setColorScheme(isDark ? 'light' : 'dark')}
      >
        {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
      </ActionIcon>
    </Tooltip>
  );
}

function ActiveScreen({ screen }: { screen: Screen }) {
  switch (screen) {
    case 'system':
      return <SystemView />;
    case 'dashboard':
      return <Dashboard />;
    case 'panel':
      return <PanelEditor />;
    case 'parts':
      return <PartsCatalog />;
    case 'pricelist':
      return <Pricelist />;
    case 'sources':
      return <Sources />;
    case 'settings':
      return <Settings />;
  }
}

export function App() {
  const activeScreen = useProjectStore((s) => s.activeScreen);
  const setScreen = useProjectStore((s) => s.setScreen);
  const projectName = useProjectStore((s) => s.project.name);

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <IconBolt size={24} color="var(--mantine-color-indigo-5)" />
            <Title order={4}>PanelMaker</Title>
            <Text c="dimmed" size="sm" visibleFrom="sm">
              · {projectName}
            </Text>
          </Group>
          <ColorSchemeToggle />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.screen}
            label={item.label}
            leftSection={item.icon}
            active={activeScreen === item.screen}
            onClick={() => setScreen(item.screen)}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <ActiveScreen screen={activeScreen} />
      </AppShell.Main>
    </AppShell>
  );
}
