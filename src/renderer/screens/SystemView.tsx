import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Drawer,
  Group,
  Menu,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBolt,
  IconBookmark,
  IconChevronDown,
  IconDeviceFloppy,
  IconDownload,
  IconPackageExport,
  IconTrash,
  IconFileSpreadsheet,
  IconFileTypeCsv,
  IconLayoutGridAdd,
  IconListDetails,
  IconPlus,
  IconSitemap,
  IconTableExport,
  IconTableImport,
  IconTags,
  IconPlugConnected,
} from '@tabler/icons-react';
import type { CostResult } from '@shared/types';
import { ProjectIssues } from '@renderer/features/issues/ProjectIssues';
import { ServiceInspector } from '@renderer/features/service/ServiceInspector';
import { LoadImportModal } from '@renderer/features/loadimport/LoadImportModal';
import { BuildingSingleLine } from '@renderer/screens/sld/BuildingSingleLine';
import { PowerOneline } from '@renderer/screens/sld/PowerOneline';
import { partsForBrand, CATALOG_BRANDS } from '@shared/data/catalog';
import { costSystemConsolidated } from '@renderer/lib/bom';
import { downloadBomCsv, downloadBomXlsx } from '@renderer/lib/bomExport';
import { downloadCsv } from '@renderer/lib/download';
import { cableScheduleCsv } from '@shared/io/scheduleExport';
import { formatIdr } from '@renderer/lib/format';
import { PANEL_TEMPLATES } from '@renderer/data/panelTemplates';
import { useProjectStore } from '@renderer/state/projectStore';
import { useSystemResult } from '@renderer/state/useSystemResult';
import { exportLabelsPdf, exportSystemPdf, saveProjectToDisk } from '@renderer/api';
import { exportAllDeliverables, exportAllMessage } from '@renderer/lib/exportAll';

export function SystemView() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const parts = useProjectStore((s) => s.parts);
  const prices = useProjectStore((s) => s.prices);
  const preferredBrand = useProjectStore((s) => s.preferredBrand);
  // Costing + order codes use the selected manufacturer (cables stay available).
  const bomParts = useMemo(() => partsForBrand(parts, preferredBrand), [parts, preferredBrand]);
  const addPanel = useProjectStore((s) => s.addPanel);
  const addPanelFromTemplate = useProjectStore((s) => s.addPanelFromTemplate);
  const userTemplates = useProjectStore((s) => s.userTemplates);
  const addPanelFromUserTemplate = useProjectStore((s) => s.addPanelFromUserTemplate);
  const removeUserTemplate = useProjectStore((s) => s.removeUserTemplate);
  const importPanels = useProjectStore((s) => s.importPanels);

  const system = useSystemResult();

  // The consolidated project BOM lives in a right-side drawer (toggled from the
  // header) rather than below the diagram, so the single-line gets the full height.
  const [bomOpen, setBomOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // A brand-new project (one panel, no circuits, no feeders) shows a warm
  // empty-state prompting the engineer to set up the service first.
  const isEmpty = useMemo(
    () => project.panels.length <= 1 && project.panels.every((p) => p.circuits.length === 0),
    [project.panels],
  );

  // Consolidated project-wide BOM (per-panel lines merged by part/description).
  const projectBom = useMemo(() => {
    const priceMap = new Map<string, number>(Object.entries(prices));
    return costSystemConsolidated(system, bomParts, priceMap);
  }, [system, bomParts, prices]);

  /** Pick a CSV load list, parse it leniently, and append its panels (undoable). */
  /** Commit a parsed load list (panels) into the project, with a summary toast. */
  function onLoadListImport(panels: typeof project.panels) {
    importPanels(panels);
    const circuitCount = panels.reduce((n, p) => n + p.circuits.length, 0);
    notifications.show({
      message: t('system.loadListImported', { panels: panels.length, circuits: circuitCount }),
      color: 'teal',
    });
  }

  const notify = (res: { ok: boolean; reason?: string; message: string }) =>
    notifications.show({
      message: res.message,
      color: res.ok ? 'teal' : res.reason === 'web' ? 'blue' : 'red',
    });

  return (
    <Stack gap="sm">
      {/* Compact toolbar — the project name already lives in the app header, so
          the canvas keeps the chrome to one row and gives the diagram the height. */}
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon variant="light" color="indigo" size="sm" radius="sm">
            <IconSitemap size={14} />
          </ThemeIcon>
          <Text fw={600} size="md" truncate style={{ letterSpacing: '-0.01em' }}>
            {project.name}
          </Text>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <ProjectIssues system={system} />
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPlugConnected size={14} />}
            onClick={() => setServiceOpen(true)}
          >
            {t('service.title')}
          </Button>
          <Menu position="bottom-end" withinPortal shadow="md" width={300}>
            <Menu.Target>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={14} />}
                rightSection={<IconChevronDown size={14} />}
              >
                {t('system.addPanel')}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconLayoutGridAdd size={14} />}
                onClick={() => addPanel()}
              >
                {t('system.blankPanel')}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Label>{t('system.fromTemplate')}</Menu.Label>
              {PANEL_TEMPLATES.map((tpl) => (
                <Menu.Item
                  key={tpl.id}
                  leftSection={<IconSitemap size={14} />}
                  onClick={() => addPanelFromTemplate(tpl.id)}
                >
                  <Text size="sm">{tpl.label}</Text>
                  <Text size="xs" c="dimmed">
                    {tpl.description}
                  </Text>
                </Menu.Item>
              ))}
              {userTemplates.length > 0 && (
                <>
                  <Menu.Divider />
                  <Menu.Label>{t('system.myTemplates')}</Menu.Label>
                  {userTemplates.map((tpl) => (
                    <Menu.Item
                      key={tpl.id}
                      leftSection={<IconBookmark size={14} />}
                      rightSection={
                        <ActionIcon
                          component="div"
                          size="xs"
                          variant="subtle"
                          color="red"
                          aria-label={t('system.removeTemplate')}
                          title={t('system.removeTemplate')}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeUserTemplate(tpl.id);
                            notifications.show({ message: t('system.templateRemoved'), color: 'gray' });
                          }}
                        >
                          <IconTrash size={12} />
                        </ActionIcon>
                      }
                      onClick={() => addPanelFromUserTemplate(tpl.id)}
                    >
                      <Text size="sm">{tpl.label}</Text>
                      <Text size="xs" c="dimmed">
                        {t('system.templateMeta', { count: tpl.circuitCount, panel: tpl.savedFrom })}
                      </Text>
                    </Menu.Item>
                  ))}
                </>
              )}
            </Menu.Dropdown>
          </Menu>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconTableImport size={14} />}
            onClick={() => setImportOpen(true)}
          >
            {t('system.importLoadList')}
          </Button>
          <Menu position="bottom-end" withinPortal shadow="md" width={240}>
            <Menu.Target>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPackageExport size={14} />}
                rightSection={<IconChevronDown size={14} />}
              >
                {t('system.export')}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconDeviceFloppy size={14} />}
                onClick={async () => notify(await saveProjectToDisk(project))}
              >
                {t('system.save')}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconDownload size={14} />}
                onClick={async () => notify(await exportSystemPdf(project))}
              >
                {t('system.exportSystemPdf')}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconTags size={14} />}
                onClick={async () => notify(await exportLabelsPdf(project))}
              >
                {t('system.exportLabels')}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconTableExport size={14} />}
                onClick={() => {
                  downloadCsv(`${project.name} - cable schedule.csv`, cableScheduleCsv(system));
                  notifications.show({ message: t('system.cableScheduleExported'), color: 'teal' });
                }}
              >
                {t('system.exportCableSchedule')}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconListDetails size={14} />}
                onClick={() => setBomOpen(true)}
              >
                {t('system.projectBom')}
              </Menu.Item>
              <Menu.Item
                color="teal"
                leftSection={<IconPackageExport size={14} />}
                onClick={async () => {
                  const res = await exportAllDeliverables();
                  notifications.show({
                    message: exportAllMessage(t, res),
                    color: res.ok ? 'teal' : res.reason === 'cancelled' ? 'gray' : 'red',
                  });
                }}
              >
                {t('system.exportAll')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      {isEmpty && (
        <Card withBorder radius="md" padding="lg" bg="var(--mantine-color-indigo-light)">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="md" wrap="nowrap">
              <ThemeIcon size={42} radius="md" variant="light" color="indigo">
                <IconPlugConnected size={24} />
              </ThemeIcon>
              <div>
                <Text fw={600}>{t('system.setupTitle')}</Text>
                <Text size="sm" c="dimmed">
                  {t('system.setupBody')}
                </Text>
              </div>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Button
                variant="filled"
                leftSection={<IconPlugConnected size={16} />}
                onClick={() => setServiceOpen(true)}
              >
                {t('system.setupCta')}
              </Button>
              <Button
                variant="default"
                leftSection={<IconTableImport size={16} />}
                onClick={() => setImportOpen(true)}
              >
                {t('system.importLoadList')}
              </Button>
            </Group>
          </Group>
        </Card>
      )}

      <Card withBorder radius="md" padding="xs">
        <Tabs defaultValue="single-line">
          <Tabs.List>
            <Tabs.Tab value="single-line" leftSection={<IconSitemap size={14} />}>
              {t('system.tabSingleLine')}
            </Tabs.Tab>
            <Tabs.Tab value="power" leftSection={<IconBolt size={14} />}>
              {t('system.tabPower')}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="single-line" pt="xs">
            <Group justify="flex-end" px="xs" pb={4}>
              <Text size="xs" c="dimmed">
                {t('system.singleLineHint')}
              </Text>
            </Group>
            <BuildingSingleLine system={system} />
          </Tabs.Panel>

          <Tabs.Panel value="power">
            <PowerOneline system={system} />
          </Tabs.Panel>
        </Tabs>
      </Card>

      <Drawer
        opened={bomOpen}
        onClose={() => setBomOpen(false)}
        position="right"
        size="xl"
        title={
          <Group gap="xs">
            <ThemeIcon variant="light" color="indigo" size="sm">
              <IconListDetails size={14} />
            </ThemeIcon>
            <Text fw={600}>{t('system.projectBom')}</Text>
          </Group>
        }
        keepMounted={false}
      >
        <ProjectBomCard cost={projectBom} projectName={project.name} />
      </Drawer>

      <ServiceInspector opened={serviceOpen} onClose={() => setServiceOpen(false)} />
      <LoadImportModal
        opened={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={onLoadListImport}
      />
    </Stack>
  );
}

/**
 * The consolidated project-wide bill of materials: every panel's lines merged by
 * part/description and category, with a grand total and CSV/Excel export. Reuses
 * the per-panel BOM export helpers — the only difference is the consolidated
 * line set.
 */
function ProjectBomCard({ cost, projectName }: { cost: CostResult; projectName: string }) {
  const { t } = useTranslation();
  const preferredBrand = useProjectStore((s) => s.preferredBrand);
  const setPreferredBrand = useProjectStore((s) => s.setPreferredBrand);
  const { lines } = cost;
  if (lines.length === 0) return null;

  const safeName = projectName.replace(/[^\w.-]+/g, '_');

  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <ThemeIcon variant="light" color="indigo">
            <IconListDetails size={16} />
          </ThemeIcon>
          <Text fw={600} size="sm">
            {t('system.projectBom')}
          </Text>
          <Text size="xs" c="dimmed">
            {t('system.bomConsolidated', { count: lines.length })}
          </Text>
        </Group>
        <Group gap="xs">
          <Select
            size="xs"
            w={160}
            placeholder={t('system.allBrands')}
            data={[...CATALOG_BRANDS]}
            value={preferredBrand}
            onChange={(v) => setPreferredBrand(v)}
            clearable
            comboboxProps={{ withinPortal: true }}
            aria-label={t('system.exportBrand')}
          />
          <Button
            size="xs"
            variant="default"
            leftSection={<IconFileTypeCsv size={14} />}
            onClick={() => downloadBomCsv(`${safeName} - project BOM.csv`, lines, cost.currency)}
          >
            {t('system.exportProjectBomCsv')}
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconFileSpreadsheet size={14} />}
            onClick={() => downloadBomXlsx(`${safeName} - project BOM.xlsx`, lines, cost.currency)}
          >
            {t('system.exportProjectBomXlsx')}
          </Button>
        </Group>
      </Group>
      <Table.ScrollContainer minWidth={620}>
        <Table verticalSpacing="xs" fz="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('system.bomItem')}</Table.Th>
              <Table.Th w={120}>{t('system.bomCategory')}</Table.Th>
              <Table.Th w={120}>{t('system.bomOrderCode')}</Table.Th>
              <Table.Th w={60} ta="right">
                {t('system.bomQty')}
              </Table.Th>
              <Table.Th w={150} ta="right">
                {t('system.bomLineTotal')}
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lines.map((l, i) => (
              <Table.Tr key={`${l.partId ?? l.description}-${i}`}>
                <Table.Td>{l.description}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color="gray" size="sm" tt="none">
                    {l.category}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {l.sku ? (
                    <Text size="xs" ff="monospace">
                      {l.sku}
                    </Text>
                  ) : (
                    <Text size="xs" c="dimmed">
                      —
                    </Text>
                  )}
                </Table.Td>
                <Table.Td ta="right">{l.qty}</Table.Td>
                <Table.Td ta="right">
                  {l.matched && l.lineTotal !== undefined ? (
                    formatIdr(l.lineTotal)
                  ) : (
                    <Badge size="xs" variant="light" color="gray">
                      {t('system.noPrice')}
                    </Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Group justify="space-between" mt="sm">
        <Text size="xs" c="dimmed">
          {cost.unmatchedCount > 0
            ? t('system.unpricedExcluded', { count: cost.unmatchedCount })
            : t('system.allLinesPriced')}
        </Text>
        <Text fw={700}>{formatIdr(cost.grandTotal)}</Text>
      </Group>
    </Card>
  );
}
