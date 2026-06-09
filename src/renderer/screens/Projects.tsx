import { useCallback, useEffect, useState } from 'react';
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
  Title,
  Tooltip,
} from '@mantine/core';
import {
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
import { downloadProjectFile, pickAndReadProjectFile } from '@renderer/lib/projectFile';

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
function fail(message: string) {
  notifications.show({ message, color: 'red', title: 'Project error' });
}

/** Multi-project management: create / open / duplicate / rename / delete + import / export. */
export function Projects() {
  const project = useProjectStore((s) => s.project);
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
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onNew() {
    setBusy(true);
    try {
      await newProject();
      ok('Created a new project.');
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
        ok('Project opened.');
        setScreen('system');
      } else {
        fail('That project could not be loaded.');
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
      ok(`Duplicated "${project.name}".`);
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
      fail('Project name cannot be empty.');
      return;
    }
    setBusy(true);
    try {
      if (id === project.id) {
        await renameProject(name);
      } else {
        // Rename a non-active stored project: load it, patch the name, save back.
        const stored = await registryLoadProject(id);
        if (!stored) throw new Error('Project not found.');
        await registrySaveProject({ ...stored, name });
      }
      ok('Project renamed.');
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
      ok(`Imported "${imported.name}".`);
      await refresh();
      setScreen('system');
    } catch (e) {
      const msg = (e as Error).message;
      // A user-cancelled picker is not an error worth a red toast.
      if (msg !== 'Import cancelled.' && msg !== 'No file selected.') fail(msg);
    } finally {
      setBusy(false);
    }
  }

  function onExport() {
    try {
      downloadProjectFile(project);
      ok(`Exported "${project.name}".`);
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
      ok(removed ? `Deleted "${target.name}".` : 'Nothing to delete.');
      setDeleting(null);
      await refresh();
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap="md">
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Workspace
        </Text>
        <Title order={3}>Projects</Title>
        <Text size="sm" c="dimmed">
          Create, open, duplicate, rename or delete projects, and import/export portable
          project files.
        </Text>
      </div>

      {!isDesktop() && (
        <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
          Running in the browser — projects are stored locally in this browser. Export to a
          file to move a project between machines or into the desktop app.
        </Alert>
      )}

      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Active project
            </Text>
            <Title order={4}>{project.name}</Title>
            <Text size="sm" c="dimmed">
              {project.panels.length} panel{project.panels.length === 1 ? '' : 's'} · id{' '}
              {project.id}
            </Text>
          </div>
          <Group gap="xs">
            <Button
              variant="light"
              leftSection={<IconCopy size={16} />}
              onClick={onDuplicate}
              loading={busy}
            >
              Duplicate
            </Button>
            <Button
              variant="light"
              leftSection={<IconDownload size={16} />}
              onClick={onExport}
            >
              Export
            </Button>
            <Button
              variant="light"
              leftSection={<IconFileImport size={16} />}
              onClick={onImport}
              loading={busy}
            >
              Import
            </Button>
            <Button leftSection={<IconPlus size={16} />} onClick={onNew} loading={busy}>
              New
            </Button>
          </Group>
        </Group>
      </Card>

      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" mb="sm">
          <Group gap="xs">
            <Title order={5}>Stored projects</Title>
            <Badge variant="light" color="gray">
              {projects.length}
            </Badge>
          </Group>
          <Tooltip label="Refresh list">
            <ActionIcon variant="default" onClick={() => void refresh()} aria-label="Refresh">
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
            No saved projects yet. The active project is saved automatically as you edit.
          </Text>
        ) : (
          <ScrollArea.Autosize mah={420}>
            <Table stickyHeader highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th ta="center">Panels</Table.Th>
                  <Table.Th>Updated</Table.Th>
                  <Table.Th ta="right">Actions</Table.Th>
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
                              active
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
                          <Tooltip label="Open">
                            <ActionIcon
                              variant="subtle"
                              onClick={() => void onOpen(p.id)}
                              disabled={busy}
                              aria-label={`Open ${p.name}`}
                            >
                              <IconFolderOpen size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Rename">
                            <ActionIcon
                              variant="subtle"
                              onClick={() => startRename(p)}
                              disabled={busy}
                              aria-label={`Rename ${p.name}`}
                            >
                              <IconPencil size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Delete">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => setDeleting(p)}
                              disabled={busy}
                              aria-label={`Delete ${p.name}`}
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
        title="Rename project"
        centered
      >
        <Stack>
          <TextInput
            label="Project name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.currentTarget.value)}
            data-autofocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void confirmRename();
            }}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button onClick={() => void confirmRename()} loading={busy}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete project"
        centered
      >
        <Stack>
          <Text size="sm">
            Delete <b>{deleting?.name}</b>? This cannot be undone.
            {deleting?.id === project.id &&
              ' This is the active project — a new blank project will open in its place.'}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void confirmDelete()} loading={busy}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
