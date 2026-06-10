import { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconBolt,
  IconCopy,
  IconDownload,
  IconFileImport,
  IconFolderOpen,
  IconInfoCircle,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { ProjectSummary } from '@shared/ipc-contract';
import { useProjectStore } from '@renderer/state/projectStore';
import { isDesktop } from '@renderer/api';
import {
  deleteProject as registryDeleteProject,
  listProjects as registryListProjects,
  loadProject as registryLoadProject,
  saveProject as registrySaveProject,
} from '@renderer/lib/projectsRegistry';
import {
  downloadProjectFile,
  isImportCancelled,
  pickAndReadProjectFile,
} from '@renderer/lib/projectFile';

/** Format an ISO timestamp for the list; falls back to a dash when absent. */
function formatWhen(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function ok(message: string) {
  notifications.show({ message, color: 'teal' });
}

/** Multi-project management: create / open / duplicate / rename / delete + import / export. */
export function Projects() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  /** Show a red error toast with the localized "Project error" title. */
  const fail = useCallback(
    (message: string) =>
      notifications.show({ message, color: 'red', title: t('projects.errorTitle') }),
    [t],
  );
  const replaceProject = useProjectStore((s) => s.replaceProject);
  const setScreen = useProjectStore((s) => s.setScreen);
  const newProject = useProjectStore((s) => s.newProject);
  const openProject = useProjectStore((s) => s.openProject);
  const duplicateActiveProject = useProjectStore((s) => s.duplicateActiveProject);
  const renameProject = useProjectStore((s) => s.renameProject);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await registryListProjects());
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fail]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onNew() {
    setBusy(true);
    try {
      await newProject();
      ok(t('projects.createdToast'));
      await refresh();
      setScreen('system');
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onOpen(id: string) {
    setBusy(true);
    try {
      const opened = await openProject(id);
      if (opened) {
        ok(t('projects.openedToast'));
        setScreen('system');
      } else {
        fail(t('projects.openFailedToast'));
      }
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDuplicate() {
    setBusy(true);
    try {
      await duplicateActiveProject();
      ok(t('projects.duplicatedToast', { name: project.name }));
      await refresh();
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startRename(summary: ProjectSummary) {
    setRenaming(summary.id);
    setRenameValue(summary.name);
  }

  async function confirmRename() {
    const id = renaming;
    if (!id) return;
    const name = renameValue.trim();
    if (name.length === 0) {
      fail(t('projects.nameEmpty'));
      return;
    }
    setBusy(true);
    try {
      if (id === project.id) {
        await renameProject(name);
      } else {
        // Rename a non-active stored project: load it, patch the name, save back.
        const stored = await registryLoadProject(id);
        if (!stored) throw new Error(t('projects.notFound'));
        await registrySaveProject({ ...stored, name });
      }
      ok(t('projects.renamedToast'));
      setRenaming(null);
      await refresh();
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    setBusy(true);
    try {
      const imported = await pickAndReadProjectFile();
      replaceProject(imported);
      await registrySaveProject(imported);
      ok(t('projects.importedToast', { name: imported.name }));
      await refresh();
      setScreen('system');
    } catch (e) {
      // A user-cancelled picker is not an error worth a red toast.
      if (!isImportCancelled(e)) fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onExport() {
    try {
      downloadProjectFile(project);
      ok(t('projects.exportedToast', { name: project.name }));
    } catch (e) {
      fail((e as Error).message);
    }
  }

  async function confirmDelete() {
    const target = deleting;
    if (!target) return;
    setBusy(true);
    try {
      const removed = await registryDeleteProject(target.id);
      if (removed && target.id === project.id) {
        // The active project was deleted — start fresh so the app stays usable.
        await newProject();
      }
      ok(removed ? t('projects.deletedToast', { name: target.name }) : t('projects.nothingToDelete'));
      setDeleting(null);
      await refresh();
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** One large welcome action: icon tile + title + description. */
  function HeroAction({
    icon,
    title,
    description,
    onClick,
  }: {
    icon: React.ReactNode;
    title: string;
    description: string;
    onClick: () => void;
  }) {
    return (
      <UnstyledButton onClick={onClick} disabled={busy} style={{ flex: 1, minWidth: 180 }}>
        <Card withBorder radius="lg" padding="lg" h="100%">
          <ThemeIcon size={40} radius="md" variant="light" color="indigo" mb="sm">
            {icon}
          </ThemeIcon>
          <Text fw={650} mb={4}>
            {title}
          </Text>
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        </Card>
      </UnstyledButton>
    );
  }

  return (
    <Stack gap="md">
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {t('projects.eyebrow')}
        </Text>
        <Title order={3}>{t('projects.title')}</Title>
        <Text size="sm" c="dimmed">
          {t('projects.subtitle')}
        </Text>
      </div>

      {!isDesktop() && (
        <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
          {t('projects.webNote')}
        </Alert>
      )}

      {/* Welcome hero: three large, obvious starting points. */}
      <Group gap="md" align="stretch" wrap="wrap">
        <HeroAction
          icon={<IconPlus size={22} />}
          title={t('projects.heroNew')}
          description={t('projects.heroNewHint')}
          onClick={() => void onNew()}
        />
        <HeroAction
          icon={<IconFileImport size={22} />}
          title={t('projects.heroImport')}
          description={t('projects.heroImportHint')}
          onClick={() => void onImport()}
        />
        <HeroAction
          icon={<IconBolt size={22} />}
          title={t('projects.heroContinue')}
          description={t('projects.heroContinueHint', { name: project.name })}
          onClick={() => setScreen('system')}
        />
      </Group>

      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              {t('projects.activeProject')}
            </Text>
            <Title order={4}>{project.name}</Title>
            <Text size="sm" c="dimmed">
              {t('projects.panelCount', { count: project.panels.length, id: project.id })}
            </Text>
          </div>
          <Group gap="xs">
            <Button
              variant="light"
              leftSection={<IconCopy size={16} />}
              onClick={onDuplicate}
              loading={busy}
            >
              {t('common.duplicate')}
            </Button>
            <Button
              variant="light"
              leftSection={<IconDownload size={16} />}
              onClick={onExport}
            >
              {t('common.export')}
            </Button>
            <Button
              variant="light"
              leftSection={<IconFileImport size={16} />}
              onClick={onImport}
              loading={busy}
            >
              {t('common.import')}
            </Button>
            <Button leftSection={<IconPlus size={16} />} onClick={onNew} loading={busy}>
              {t('projects.newProject')}
            </Button>
          </Group>
        </Group>
      </Card>

      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" mb="sm">
          <Group gap="xs">
            <Title order={5}>{t('projects.storedProjects')}</Title>
            <Badge variant="light" color="gray">
              {projects.length}
            </Badge>
          </Group>
          <Tooltip label={t('projects.refreshList')}>
            <ActionIcon
              variant="default"
              onClick={() => void refresh()}
              aria-label={t('projects.refresh')}
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>

        {loading ? (
          <Group justify="center" p="md">
            <Loader size="sm" />
          </Group>
        ) : projects.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t('projects.noProjects')}
          </Text>
        ) : (
          <ScrollArea.Autosize mah={420}>
            <Table stickyHeader highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('projects.colName')}</Table.Th>
                  <Table.Th ta="center">{t('projects.colPanels')}</Table.Th>
                  <Table.Th>{t('projects.colUpdated')}</Table.Th>
                  <Table.Th ta="right">{t('projects.colActions')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {projects.map((p) => {
                  const active = p.id === project.id;
                  return (
                    <Table.Tr key={p.id}>
                      <Table.Td>
                        <Group gap="xs">
                          <Text fw={active ? 600 : 400}>{p.name}</Text>
                          {active && (
                            <Badge size="xs" color="indigo" variant="light">
                              {t('projects.active')}
                            </Badge>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td ta="center">{p.panelCount}</Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {formatWhen(p.updatedAt)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} justify="flex-end">
                          <Tooltip label={t('projects.openTip')}>
                            <ActionIcon
                              variant="subtle"
                              onClick={() => void onOpen(p.id)}
                              disabled={busy}
                              aria-label={t('projects.openAria', { name: p.name })}
                            >
                              <IconFolderOpen size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label={t('projects.renameTip')}>
                            <ActionIcon
                              variant="subtle"
                              onClick={() => startRename(p)}
                              disabled={busy}
                              aria-label={t('projects.renameAria', { name: p.name })}
                            >
                              <IconPencil size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label={t('projects.deleteTip')}>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => setDeleting(p)}
                              disabled={busy}
                              aria-label={t('projects.deleteAria', { name: p.name })}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
      </Card>

      <Modal
        opened={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t('projects.renameTitle')}
        centered
      >
        <Stack>
          <TextInput
            label={t('projects.projectName')}
            value={renameValue}
            onChange={(e) => setRenameValue(e.currentTarget.value)}
            data-autofocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void confirmRename();
            }}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRenaming(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void confirmRename()} loading={busy}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('projects.deleteTitle')}
        centered
      >
        <Stack>
          <Text size="sm">
            <Trans i18nKey="projects.deleteBody" values={{ name: deleting?.name ?? '' }}>
              Delete <b>{deleting?.name}</b>? This cannot be undone.
            </Trans>
            {deleting?.id === project.id && t('projects.deleteActiveSuffix')}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button color="red" onClick={() => void confirmDelete()} loading={busy}>
              {t('common.delete')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
