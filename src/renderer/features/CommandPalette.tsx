import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Group, Kbd, Modal, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import {
  IconAdjustmentsBolt,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBox,
  IconChartLine,
  IconDeviceFloppy,
  IconFileTypePdf,
  IconFolder,
  IconGauge,
  IconLayoutGridAdd,
  IconMoon,
  IconPackageExport,
  IconPlus,
  IconReceipt,
  IconReceipt2,
  IconSearch,
  IconSettings,
  IconSitemap,
  IconSolarPanel,
} from '@tabler/icons-react';
import { useMantineColorScheme, useComputedColorScheme } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { panelLabel } from '@shared/labels';
import { useProjectStore, type Screen } from '@renderer/state/projectStore';
import { exportSystemPdf, saveProjectToDisk } from '@renderer/api';
import { exportAllDeliverables, exportAllMessage } from '@renderer/lib/exportAll';

interface Command {
  id: string;
  label: string;
  /** Section chip shown on the right. */
  section: string;
  icon: React.ReactNode;
  keywords?: string;
  run: () => void;
}

const SCREEN_ICONS: Record<Screen, React.ReactNode> = {
  projects: <IconFolder size={16} />,
  system: <IconSitemap size={16} />,
  dashboard: <IconGauge size={16} />,
  panel: <IconAdjustmentsBolt size={16} />,
  coordination: <IconChartLine size={16} />,
  parts: <IconBox size={16} />,
  pricelist: <IconReceipt size={16} />,
  quotation: <IconReceipt2 size={16} />,
  sources: <IconSolarPanel size={16} />,
  settings: <IconSettings size={16} />,
};

// 'panel' is omitted: the standalone Panel Editor screen was retired (it
// redirects to the system view), so offering it here would be a dead jump.
const SCREENS: Screen[] = [
  'projects',
  'system',
  'dashboard',
  'coordination',
  'parts',
  'pricelist',
  'quotation',
  'sources',
  'settings',
];

/**
 * ⌘K / Ctrl+K command palette: jump to any screen or panel, add circuits and
 * panels, undo/redo, toggle the color scheme — keyboard-first. Custom-built on
 * Modal (no extra dependency; fully offline).
 */
export function CommandPalette() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const panels = useProjectStore((s) => s.project.panels);
  const project = useProjectStore((s) => s.project);
  const setScreen = useProjectStore((s) => s.setScreen);
  const setActivePanel = useProjectStore((s) => s.setActivePanel);
  const addCircuit = useProjectStore((s) => s.addCircuit);
  const addPanel = useProjectStore((s) => s.addPanel);
  const activePanelId = useProjectStore((s) => s.activePanelId);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const { setColorScheme } = useMantineColorScheme();
  const computedScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });

  // Global shortcut: ⌘K / Ctrl+K toggles; the header button fires the same via
  // a custom event; Escape closes (Modal handles it too).
  useEffect(() => {
    const openFresh = () => {
      setOpen(true);
      setQuery('');
      setActiveIdx(0);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery('');
        setActiveIdx(0);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('panelmaker:open-palette', openFresh);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('panelmaker:open-palette', openFresh);
    };
  }, []);

  const close = () => setOpen(false);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = SCREENS.map((screen) => ({
      id: `nav:${screen}`,
      label: t(`nav.${screen}`),
      section: t('palette.sectionNavigate'),
      icon: SCREEN_ICONS[screen],
      run: () => {
        setScreen(screen);
        close();
      },
    }));
    const panelCmds: Command[] = panels.map((p) => ({
      id: `panel:${p.id}`,
      label: panelLabel(p),
      section: t('palette.sectionPanels'),
      icon: <IconAdjustmentsBolt size={16} />,
      keywords: 'panel',
      run: () => {
        setActivePanel(p.id);
        setScreen('system');
        close();
      },
    }));
    const actions: Command[] = [
      {
        id: 'act:add-circuit',
        label: t('palette.addCircuit'),
        section: t('palette.sectionActions'),
        icon: <IconPlus size={16} />,
        run: () => {
          if (activePanelId) {
            addCircuit(activePanelId);
            setScreen('system');
          }
          close();
        },
      },
      {
        id: 'act:add-panel',
        label: t('palette.addPanel'),
        section: t('palette.sectionActions'),
        icon: <IconLayoutGridAdd size={16} />,
        run: () => {
          addPanel();
          close();
        },
      },
      {
        id: 'act:export-pdf',
        label: t('palette.exportPdf'),
        section: t('palette.sectionActions'),
        icon: <IconFileTypePdf size={16} />,
        keywords: 'export pdf single-line report',
        run: () => {
          void exportSystemPdf(project).then((r) =>
            notifications.show({ message: r.message, color: r.ok ? 'teal' : r.reason === 'web' ? 'blue' : 'red' }),
          );
          close();
        },
      },
      {
        id: 'act:export-all',
        label: t('palette.exportAll'),
        section: t('palette.sectionActions'),
        icon: <IconPackageExport size={16} />,
        keywords: 'export all deliverables bom schedule dxf pdf',
        run: () => {
          void exportAllDeliverables().then((r) =>
            notifications.show({
              message: exportAllMessage(t, r),
              color: r.ok ? 'teal' : r.reason === 'cancelled' ? 'gray' : 'red',
            }),
          );
          close();
        },
      },
      {
        id: 'act:save',
        label: t('palette.saveProject'),
        section: t('palette.sectionActions'),
        icon: <IconDeviceFloppy size={16} />,
        keywords: 'save disk',
        run: () => {
          void saveProjectToDisk(project).then((r) =>
            notifications.show({ message: r.message, color: r.ok ? 'teal' : r.reason === 'web' ? 'blue' : 'red' }),
          );
          close();
        },
      },
      {
        id: 'act:undo',
        label: t('history.undo'),
        section: t('palette.sectionActions'),
        icon: <IconArrowBackUp size={16} />,
        run: () => {
          undo();
          close();
        },
      },
      {
        id: 'act:redo',
        label: t('history.redo'),
        section: t('palette.sectionActions'),
        icon: <IconArrowForwardUp size={16} />,
        run: () => {
          redo();
          close();
        },
      },
      {
        id: 'act:scheme',
        label: computedScheme === 'dark' ? t('colorScheme.toLight') : t('colorScheme.toDark'),
        section: t('palette.sectionActions'),
        icon: <IconMoon size={16} />,
        keywords: 'theme dark light',
        run: () => {
          setColorScheme(computedScheme === 'dark' ? 'light' : 'dark');
          close();
        },
      },
    ];
    return [...nav, ...panelCmds, ...actions];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels, project, activePanelId, computedScheme, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.section} ${c.keywords ?? ''}`.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Keep the active row inside the filtered range and scrolled into view.
  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered.length, activeIdx]);
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  return (
    <Modal
      opened={open}
      onClose={close}
      withCloseButton={false}
      size={560}
      padding={0}
      yOffset="15vh"
      transitionProps={{ transition: 'pop', duration: 120 }}
    >
      <TextInput
        ref={inputRef}
        data-autofocus
        size="md"
        variant="unstyled"
        px="md"
        pt={8}
        leftSection={<IconSearch size={18} />}
        placeholder={t('palette.placeholder')}
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          setActiveIdx(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            filtered[activeIdx]?.run();
          }
        }}
      />
      <Stack
        ref={listRef}
        gap={2}
        p="xs"
        style={{ maxHeight: 360, overflowY: 'auto', borderTop: '1px solid var(--mantine-color-default-border)' }}
      >
        {filtered.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="lg">
            {t('palette.nothing')}
          </Text>
        )}
        {filtered.map((c, i) => (
          <UnstyledButton
            key={c.id}
            data-idx={i}
            onMouseEnter={() => setActiveIdx(i)}
            onClick={c.run}
            px="sm"
            py={8}
            style={{
              borderRadius: 'var(--mantine-radius-md)',
              background: i === activeIdx ? 'var(--mantine-primary-color-light)' : undefined,
            }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                {c.icon}
                <Text size="sm" truncate>
                  {c.label}
                </Text>
              </Group>
              <Badge size="xs" variant="light" color="gray">
                {c.section}
              </Badge>
            </Group>
          </UnstyledButton>
        ))}
      </Stack>
      <Group justify="flex-end" gap="xs" px="md" py={6} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        <Text size="xs" c="dimmed">
          <Kbd size="xs">↑↓</Kbd> {t('palette.navigateHint')} · <Kbd size="xs">↵</Kbd> {t('palette.runHint')}
        </Text>
      </Group>
    </Modal>
  );
}

/** Ask the mounted palette to open (used by the header search button). */
export function openCommandPalette(): void {
  window.dispatchEvent(new Event('panelmaker:open-palette'));
}
