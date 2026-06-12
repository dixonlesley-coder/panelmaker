import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell, Center, Group, Loader, Menu, NavLink, Stack, ThemeIcon, Title, ActionIcon, Tooltip, Text, useMantineColorScheme, useComputedColorScheme } from '@mantine/core';
import {
  IconSun,
  IconMoon,
  IconSearch,
  IconFolder,
  IconSitemap,
  IconGauge,
  IconInfoSquareRounded,
  IconChartLine,
  IconBox,
  IconReceipt,
  IconReceipt2,
  IconSolarPanel,
  IconSettings,
  IconBolt,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconLanguage,
  IconCheck,
} from '@tabler/icons-react';

import { setLanguage, SUPPORTED_LANGUAGES, type Language } from '@renderer/i18n';

import {
  useProjectStore,
  selectCanUndo,
  selectCanRedo,
  type Screen,
} from '@renderer/state/projectStore';
import { Projects } from '@renderer/screens/Projects';
import { SystemView } from '@renderer/screens/SystemView';
import { SystemInfo } from '@renderer/screens/SystemInfo';
import { Dashboard } from '@renderer/screens/Dashboard';
import { Coordination } from '@renderer/screens/Coordination';
import { PartsCatalog } from '@renderer/screens/PartsCatalog';
import { Pricelist } from '@renderer/screens/Pricelist';
import { Quotation } from '@renderer/screens/Quotation';
import { Sources } from '@renderer/screens/Sources';
import { Settings } from '@renderer/screens/Settings';
import { UpdateNotifier } from '@renderer/features/update/UpdateNotifier';
import { CommandPalette, openCommandPalette } from '@renderer/features/CommandPalette';
import { useAutosave } from '@renderer/features/autosave/useAutosave';
import { AutosaveIndicator } from '@renderer/features/autosave/AutosaveIndicator';

interface NavItem {
  screen: Screen;
  /** Translation key under the `nav.*` namespace. */
  labelKey: string;
  icon: React.ReactNode;
}

/** Navigation grouped by workflow, so the sidebar reads as a process, not a list. */
interface NavSection {
  /** Translation key under the `nav.section*` namespace. */
  labelKey: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: 'nav.sectionDesign',
    items: [
      { screen: 'projects', labelKey: 'nav.projects', icon: <IconFolder size={18} /> },
      { screen: 'system', labelKey: 'nav.system', icon: <IconSitemap size={18} /> },
      { screen: 'coordination', labelKey: 'nav.coordination', icon: <IconChartLine size={18} /> },
      { screen: 'sources', labelKey: 'nav.sources', icon: <IconSolarPanel size={18} /> },
    ],
  },
  {
    labelKey: 'nav.sectionInsight',
    items: [
      { screen: 'overview', labelKey: 'nav.overview', icon: <IconInfoSquareRounded size={18} /> },
      { screen: 'dashboard', labelKey: 'nav.dashboard', icon: <IconGauge size={18} /> },
    ],
  },
  {
    labelKey: 'nav.sectionCommercial',
    items: [
      { screen: 'parts', labelKey: 'nav.parts', icon: <IconBox size={18} /> },
      { screen: 'pricelist', labelKey: 'nav.pricelist', icon: <IconReceipt size={18} /> },
      { screen: 'quotation', labelKey: 'nav.quotation', icon: <IconReceipt2 size={18} /> },
    ],
  },
  {
    labelKey: 'nav.sectionSetup',
    items: [{ screen: 'settings', labelKey: 'nav.settings', icon: <IconSettings size={18} /> }],
  },
];

/** Toggle between light and dark color schemes. */
function ColorSchemeToggle() {
  const { t } = useTranslation();
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = computed === 'dark';
  return (
    <Tooltip label={isDark ? t('colorScheme.toLight') : t('colorScheme.toDark')}>
      <ActionIcon
        variant="default"
        size="lg"
        aria-label={t('colorScheme.toggle')}
        onClick={() => setColorScheme(isDark ? 'light' : 'dark')}
      >
        {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
      </ActionIcon>
    </Tooltip>
  );
}

/** Endonyms for the shipped languages (shown in their own language by convention). */
const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  id: 'Bahasa Indonesia',
};

/** Compact UI-language picker for the header (mirrors the Settings switcher). */
function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const current = (i18n.resolvedLanguage as Language | undefined) ?? 'en';
  return (
    <Menu shadow="md" width={200} position="bottom-end" withinPortal>
      <Menu.Target>
        <Tooltip label={t('settings.language')}>
          <ActionIcon variant="default" size="lg" aria-label={t('settings.language')}>
            <IconLanguage size={18} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {SUPPORTED_LANGUAGES.map((lng) => (
          <Menu.Item
            key={lng}
            onClick={() => setLanguage(lng)}
            leftSection={
              lng === current ? <IconCheck size={14} /> : <span style={{ display: 'inline-block', width: 14 }} />
            }
          >
            {LANGUAGE_LABELS[lng]}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/** Platform-aware modifier label for the undo/redo shortcut tooltips. */
const MOD_KEY =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

/** Undo / redo buttons, disabled when the matching history stack is empty. */
function HistoryControls() {
  const { t } = useTranslation();
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useProjectStore(selectCanUndo);
  const canRedo = useProjectStore(selectCanRedo);

  return (
    <Group gap={4}>
      <Tooltip label={`${t('history.undo')} (${MOD_KEY}+Z)`}>
        <ActionIcon
          variant="default"
          size="lg"
          aria-label={t('history.undo')}
          disabled={!canUndo}
          onClick={() => undo()}
        >
          <IconArrowBackUp size={18} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={`${t('history.redo')} (${MOD_KEY}+Shift+Z)`}>
        <ActionIcon
          variant="default"
          size="lg"
          aria-label={t('history.redo')}
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
    case 'overview':
      return <SystemInfo />;
    case 'dashboard':
      return <Dashboard />;
    case 'panel':
      // The standalone Panel Editor was retired — editing now happens on the
      // single-line (double-click a component / drag the palette / the panel
      // inspector). Any leftover navigation to 'panel' lands there.
      return <SystemView />;
    case 'coordination':
      return <Coordination />;
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
  const { t } = useTranslation();
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
    // Branded splash while the autosaved project hydrates — the same app mark
    // as the header, so launch feels intentional rather than blank.
    return (
      <Center h="100vh" className="screen-enter">
        <Stack align="center" gap="lg">
          <ThemeIcon
            size={72}
            radius={20}
            variant="gradient"
            gradient={{ from: 'indigo.6', to: 'violet.5', deg: 135 }}
          >
            <IconBolt size={40} />
          </ThemeIcon>
          <Loader size="sm" />
        </Stack>
      </Center>
    );
  }

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 248, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Header className="app-chrome">
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            {/* App mark: a soft gradient tile, reads as an app icon. */}
            <ThemeIcon
              size={32}
              radius="md"
              variant="gradient"
              gradient={{ from: 'indigo.6', to: 'violet.5', deg: 135 }}
            >
              <IconBolt size={19} />
            </ThemeIcon>
            <Title order={4} style={{ letterSpacing: '-0.01em' }}>
              PanelMaker
            </Title>
            <Text c="dimmed" size="sm" visibleFrom="sm" truncate style={{ minWidth: 0 }}>
              {projectName}
            </Text>
          </Group>
          <Group gap="md" wrap="nowrap">
            <Tooltip label={`${t('palette.open')} (${MOD_KEY}+K)`}>
              <ActionIcon
                variant="default"
                size="lg"
                aria-label={t('palette.open')}
                onClick={openCommandPalette}
              >
                <IconSearch size={18} />
              </ActionIcon>
            </Tooltip>
            <HistoryControls />
            <AutosaveIndicator saveState={saveState} target={target} />
            <LanguageMenu />
            <ColorSchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" className="app-chrome" style={{ gap: 2 }}>
        {NAV_SECTIONS.map((section, si) => (
          <div key={section.labelKey}>
            <Text
              size="xs"
              c="dimmed"
              fw={600}
              tt="uppercase"
              px="sm"
              pb={4}
              pt={si === 0 ? 4 : 'md'}
              style={{ letterSpacing: '0.04em' }}
            >
              {t(section.labelKey)}
            </Text>
            {section.items.map((item) => (
              <NavLink
                key={item.screen}
                label={t(item.labelKey)}
                leftSection={item.icon}
                active={activeScreen === item.screen}
                onClick={() => setScreen(item.screen)}
              />
            ))}
          </div>
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        {/* Keyed per screen so navigation re-triggers the glide-in animation. */}
        <div key={activeScreen} className="screen-enter">
          <ActiveScreen screen={activeScreen} />
        </div>
      </AppShell.Main>

      <CommandPalette />
      <UpdateNotifier />
    </AppShell>
  );
}
