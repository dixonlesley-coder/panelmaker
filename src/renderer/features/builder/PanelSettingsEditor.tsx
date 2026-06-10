import { useTranslation } from 'react-i18next';
import {
  Modal,
  NumberInput,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import type { InstallMethod, PanelInput, SystemType } from '@shared/types';
import { OCCUPANCY_PRESETS, OCCUPANCY_TYPES } from '@shared/standards';
import { useProjectStore } from '@renderer/state/projectStore';

const INSTALL_METHODS: InstallMethod[] = ['conduit', 'trunking', 'wall', 'air', 'tray', 'buried'];

/**
 * Edit the panel's supply / electrical context straight from the single-line —
 * opened by double-clicking the incomer or busbar. System, voltage, supply type,
 * ambient, install method, grouping and diversity all feed the live sizing.
 */
export function PanelSettingsEditor({
  panel,
  opened,
  onClose,
}: {
  panel: PanelInput;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const updatePanel = useProjectStore((s) => s.updatePanel);
  const setPanelOccupancy = useProjectStore((s) => s.setPanelOccupancy);
  const patch = (p: Partial<PanelInput>) => updatePanel(panel.id, p);

  return (
    <Modal opened={opened} onClose={onClose} size="lg" title={t('panelSettings.title')}>
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <div>
            <Text size="sm" fw={500} mb={4}>
              {t('panelSettings.system')}
            </Text>
            <SegmentedControl
              fullWidth
              data={[
                { value: '1ph', label: '1-phase' },
                { value: '3ph', label: '3-phase' },
              ]}
              value={panel.system}
              onChange={(v) =>
                patch({ system: v as SystemType, voltageV: v === '1ph' ? 230 : 400 })
              }
            />
          </div>
          <NumberInput
            label={t('panelSettings.voltage')}
            value={panel.voltageV}
            min={100}
            step={10}
            suffix=" V"
            onChange={(v) => typeof v === 'number' && patch({ voltageV: v })}
          />
          <div>
            <Text size="sm" fw={500} mb={4}>
              {t('panelSettings.supply')}
            </Text>
            <SegmentedControl
              fullWidth
              data={[
                { value: 'utility', label: t('panelSettings.utility') },
                { value: 'feeder', label: t('panelSettings.feeder') },
              ]}
              value={panel.sourceType}
              onChange={(v) => patch({ sourceType: v as PanelInput['sourceType'] })}
            />
          </div>
          <Select
            label={t('panelSettings.occupancy')}
            data={OCCUPANCY_TYPES.map((o) => ({ value: o, label: OCCUPANCY_PRESETS[o].label }))}
            value={panel.occupancy ?? null}
            placeholder={t('panel.occupancyPlaceholder')}
            clearable
            comboboxProps={{ withinPortal: true }}
            onChange={(v) => setPanelOccupancy(panel.id, (v as PanelInput['occupancy']) ?? undefined)}
          />
          <Select
            label={t('panelSettings.installMethod')}
            data={INSTALL_METHODS.map((m) => ({ value: m, label: t(`installMethod.${m}`) }))}
            value={panel.installMethod}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            onChange={(v) => v && patch({ installMethod: v as InstallMethod })}
          />
          <Select
            label={t('panelSettings.insulation')}
            description={t('panelSettings.insulationHint')}
            data={[
              { value: 'PVC', label: 'PVC 70 °C (NYM / NYY)' },
              { value: 'XLPE', label: 'XLPE 90 °C (N2XY)' },
            ]}
            value={panel.insulation ?? 'PVC'}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            onChange={(v) => v && patch({ insulation: v as PanelInput['insulation'] })}
          />
          <Select
            label={t('panelSettings.material')}
            description={t('panelSettings.materialHint')}
            data={[
              { value: 'Cu', label: t('panelSettings.materialCu') },
              { value: 'Al', label: t('panelSettings.materialAl') },
            ]}
            value={panel.material ?? 'Cu'}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            onChange={(v) => v && patch({ material: v as PanelInput['material'] })}
          />
          <NumberInput
            label={t('panelSettings.ambient')}
            value={panel.ambientTempC}
            min={10}
            max={60}
            step={5}
            suffix=" °C"
            onChange={(v) => typeof v === 'number' && patch({ ambientTempC: v })}
          />
          <NumberInput
            label={t('panelSettings.grouping')}
            description={t('panelSettings.groupingHint')}
            value={panel.groupingCount}
            min={1}
            max={20}
            onChange={(v) => typeof v === 'number' && patch({ groupingCount: v })}
          />
          <NumberInput
            label={t('panelSettings.diversity')}
            description={t('panelSettings.diversityHint')}
            value={panel.diversityFactor}
            min={0.1}
            max={1}
            step={0.05}
            decimalScale={2}
            onChange={(v) => typeof v === 'number' && patch({ diversityFactor: v })}
          />
        </SimpleGrid>
      </Stack>
    </Modal>
  );
}
