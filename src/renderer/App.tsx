import { useEffect } from 'react';
import { AppShell, Center, Group, Loader, NavLink, Title, ActionIcon, Tooltip, Text, useMantineColorScheme, useComputedColorScheme } from '@mantine/core';
import {
  IconSun,
  IconMoon,
  IconFolder,
  IconSitemap,
  IconGauge,
  IconAdjustmentsBolt,
  IconBox,
  IconReceipt,
  IconReceipt2,
  IconSolarPanel,
  IconSettings,
  IconBolt,
  IconArrowBackUp,
  IconArrowForwardUp,
} from '@tabler/icons-react';

import {
  useProjectStore,
  selectCanUndo,
  selectCanRedo,
  type Screen,
} from '@renderer/state/projectStore';
import { Projects } from '@renderer/screens/Projects';
import { SystemView } from '@renderer/screens/SystemView';
import { Dashboard } from '@renderer/screens/Dashboard';
import { PanelEditor } from '@renderer/screens/PanelEditor';
import { PartsCatalog } from '@renderer/screens/PartsCatalog';
import { Pricelist } from '@renderer/screens/Pricelist';
import { Quotation } from '@renderer/screens/Quotation';
import { Sources } from '@renderer/screens/Sources';
import { Settings } from '@renderer/screens/Settings';
import { UpdateNotifier } from '@renderer/features/update/UpdateNotifier';
import { useAutosave } from '@renderer/features/autosave/useAutosave';
import { AutosaveIndicator } from '@renderer/features/autosave/AutosaveIndicator';

interface NavItem {
  screen: Screen;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { screen: 'projects', label: 'Projects', icon: <IconFolder size={18} /> },
  { screen: 'system', label: 'System', icon: <IconSitemap size={18} /> },
  { screen: 'dashboard', label: 'Dashboard', icon: <IconGauge size={18} /> },
  { screen: 'panel', label: 'Panel Editor', icon: <IconAdjustmentsBolt size={18} /> },
  { screen: 'parts', label: 'Parts Catalog', icon: <IconBox size={18} /> },
  { screen: 'pricelist', label: 'Pricelist', icon: <IconReceipt size={18} /> },
  { screen: 'quotation', label: 'Quotation', icon: <IconReceipt2 size={18} /> },
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

/** Platform-aware modifier label for the undo/redo shortcut tooltips. */
const MOD_KEY =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

/** Undo / redo buttons, disabled when the matching history stack is empty. */
function HistoryControls() {
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useProjectStore(selectCanUndo);
  const canRedo = useProjectStore(selectCanRedo);

  return (
    <Group gap={4}>
      <Tooltip label={`Undo (${MOD_KEY}+Z)`}>
        <ActionIcon
          variant="default"
          size="lg"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={() => undo()}
        >
          <IconArrowBackUp size={18} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={`Redo (${MOD_KEY}+Shift+Z)`}>
        <ActionIcon
          variant="default"
          size="lg"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={() => redo()}
        >
          <IconArrowForwardUp size={18} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

function ActiveScreen({ screen }: { screen: Screen }) {
  switch (screen) {
    case 'projects':
      return <Projects />;
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
    case 'quotation':
      return <Quotation />;
    case 'sources':
      return <Sources />;
    case 'settings':
      return <Settings />;
  }
}

/** True when a keystroke should be left to native field-level editing/undo. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export function App() {
  const activeScreen = useProjectStore((s) => s.activeScreen);
  const setScreen = useProjectStore((s) => s.setScreen);
  const projectName = useProjectStore((s) => s.project.name);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const { hydrated, saveState, target } = useAutosave();

  // Global undo/redo shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      const isUndo = key === 'z' && !e.shiftKey;
      const isRedo = (key === 'z' && e.shiftKey) || key === 'y';
      if (!isUndo && !isRedo) return;
      // Don't hijack native undo inside form fields.
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      if (isRedo) redo();
      else undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  if (!hydrated) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

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
          <Group gap="md">
            <HistoryControls />
            <AutosaveIndicator saveState={saveState} target={target} />
            <ColorSchemeToggle />
          </Group>
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

      <UpdateNotifier />
    </AppShell>
  );
}
