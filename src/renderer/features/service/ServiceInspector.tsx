/**
 * The Incoming Service & Earthing inspector — one place for the decisions that
 * govern every downstream size: supply phase + voltage, PLN connected power
 * ("daya tersambung"), earthing system, transformer arrangement, site exposure,
 * power-factor target, and which energy sources are enabled.
 *
 * It replaces hunting across Settings (earthing), SystemInfo (supply) and the
 * Sources screen. The same component doubles as the guided first-run setup — it
 * edits the project's service root panel and project-level settings directly,
 * so there is no separate model to reconcile.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Anchor,
  Badge,
  Divider,
  Drawer,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import type { EarthingSystem, OccupancyType } from '@shared/types';
import { dayaTiers, formatDaya, OCCUPANCY_PRESETS, OCCUPANCY_TYPES } from '@shared/standards';
import { DEFAULT_BATTERY, DEFAULT_GENERATOR, DEFAULT_SOLAR } from '@renderer/data/sourceDefaults';
import { serviceRootId } from '@renderer/lib/panelTree';
import { useProjectStore } from '@renderer/state/projectStore';
import { useSystemResult } from '@renderer/state/useSystemResult';

const EARTHING_SYSTEMS: EarthingSystem[] = ['TN-C-S', 'TN-S', 'TT'];

export function ServiceInspector({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const updatePanel = useProjectStore((s) => s.updatePanel);
  const setEarthingSystem = useProjectStore((s) => s.setEarthingSystem);
  const setProjectMeta = useProjectStore((s) => s.setProjectMeta);
  const setSiteConditions = useProjectStore((s) => s.setSiteConditions);
  const updateSources = useProjectStore((s) => s.updateSources);
  const setScreen = useProjectStore((s) => s.setScreen);
  const system = useSystemResult();

  // The service-entrance panel is the editing target for supply phase/occupancy.
  const rootId = useMemo(() => serviceRootId(project, system), [project, system]);
  const root = project.panels.find((p) => p.id === rootId) ?? project.panels[0];

  const phase: '1ph' | '3ph' = root?.system === '1ph' ? '1ph' : '3ph';
  const phaseNum: 1 | 3 = phase === '1ph' ? 1 : 3;

  const supply = system.supply;
  const recommended = supply.recommendedDayaVa;
  const contracted = project.meta?.contractedDayaVa;

  const dayaOptions = useMemo(() => {
    const opts = dayaTiers(phaseNum).map((va) => ({
      value: String(va),
      label: va === recommended ? `${formatDaya(va)} · ${t('service.recommended')}` : formatDaya(va),
    }));
    return [{ value: '', label: t('service.dayaAuto') }, ...opts];
  }, [phaseNum, recommended, t]);

  const setPhase = (next: '1ph' | '3ph') => {
    if (!root) return;
    updatePanel(root.id, { system: next, voltageV: next === '1ph' ? 230 : 400 });
  };

  const demandVa = Math.round((supply.demandKva ?? 0) * 1000);
  const overDaya = contracted !== undefined && demandVa > contracted;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={420}
      title={
        <Group gap="xs">
          <Text fw={700}>{t('service.title')}</Text>
          <Badge size="sm" variant="light" color={overDaya ? 'orange' : 'teal'}>
            {supply.type === 'MV' ? t('service.mv') : t('service.lv')}
          </Badge>
        </Group>
      }
    >
      <Stack gap="lg">
        {/* Supply */}
        <Stack gap="xs">
          <Text size="sm" fw={600} c="dimmed" tt="uppercase">
            {t('service.supply')}
          </Text>
          <Group justify="space-between">
            <Text size="sm">{t('service.phase')}</Text>
            <SegmentedControl
              size="xs"
              value={phase}
              onChange={(v) => setPhase(v as '1ph' | '3ph')}
              data={[
                { value: '1ph', label: t('service.phase1') },
                { value: '3ph', label: t('service.phase3') },
              ]}
            />
          </Group>
          <Select
            label={t('service.daya')}
            description={
              recommended
                ? t('service.dayaHint', { value: formatDaya(recommended), demand: formatDaya(demandVa) })
                : undefined
            }
            data={dayaOptions}
            value={contracted !== undefined ? String(contracted) : ''}
            onChange={(v) =>
              setProjectMeta({ contractedDayaVa: v ? Number(v) : undefined })
            }
            allowDeselect={false}
            error={overDaya ? t('service.dayaOver') : undefined}
          />
          <Switch
            label={t('service.dualTransformer')}
            description={t('service.dualTransformerHint')}
            checked={project.meta?.dualTransformer === true}
            onChange={(e) => setProjectMeta({ dualTransformer: e.currentTarget.checked })}
          />
        </Stack>

        <Divider />

        {/* Earthing */}
        <Stack gap="xs">
          <Text size="sm" fw={600} c="dimmed" tt="uppercase">
            {t('service.earthing')}
          </Text>
          <Select
            label={t('service.earthingSystem')}
            data={EARTHING_SYSTEMS.map((s) => ({ value: s, label: s }))}
            value={project.earthingSystem ?? 'TN-C-S'}
            onChange={(v) => v && setEarthingSystem(v as EarthingSystem)}
            allowDeselect={false}
          />
          <Switch
            label={t('service.overhead')}
            checked={project.site?.overheadSupply === true}
            onChange={(e) => setSiteConditions({ overheadSupply: e.currentTarget.checked })}
          />
          <Switch
            label={t('service.lps')}
            checked={project.site?.externalLps === true}
            onChange={(e) => setSiteConditions({ externalLps: e.currentTarget.checked })}
          />
        </Stack>

        <Divider />

        {/* Building + power factor */}
        <Stack gap="xs">
          <Text size="sm" fw={600} c="dimmed" tt="uppercase">
            {t('service.building')}
          </Text>
          <Select
            label={t('service.occupancy')}
            description={t('service.occupancyHint')}
            data={OCCUPANCY_TYPES.map((o) => ({ value: o, label: OCCUPANCY_PRESETS[o].label }))}
            value={root?.occupancy ?? null}
            placeholder={t('service.occupancyNone')}
            clearable
            onChange={(v) => root && updatePanel(root.id, { occupancy: (v as OccupancyType) ?? undefined })}
          />
          <NumberInput
            label={t('service.targetPf')}
            min={0.85}
            max={0.99}
            step={0.01}
            decimalScale={2}
            value={project.meta?.targetPf ?? 0.95}
            onChange={(v) => setProjectMeta({ targetPf: typeof v === 'number' ? v : 0.95 })}
          />
        </Stack>

        <Divider />

        {/* Energy sources (quick toggles) */}
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" fw={600} c="dimmed" tt="uppercase">
              {t('service.sources')}
            </Text>
            <Anchor size="xs" onClick={() => { onClose(); setScreen('sources'); }}>
              {t('service.configureSources')}
            </Anchor>
          </Group>
          <Switch
            label={t('service.generator')}
            checked={project.sources?.generator?.enabled === true}
            onChange={(e) =>
              updateSources({ generator: { ...DEFAULT_GENERATOR, ...project.sources?.generator, enabled: e.currentTarget.checked } })
            }
          />
          <Switch
            label={t('service.solar')}
            checked={project.sources?.solar?.enabled === true}
            onChange={(e) =>
              updateSources({ solar: { ...DEFAULT_SOLAR, ...project.sources?.solar, enabled: e.currentTarget.checked } })
            }
          />
          <Switch
            label={t('service.battery')}
            checked={project.sources?.battery?.enabled === true}
            onChange={(e) =>
              updateSources({ battery: { ...DEFAULT_BATTERY, ...project.sources?.battery, enabled: e.currentTarget.checked } })
            }
          />
        </Stack>
      </Stack>
    </Drawer>
  );
}
