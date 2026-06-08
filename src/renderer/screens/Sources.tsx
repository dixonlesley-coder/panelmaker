import { useMemo } from 'react';
import {
  Card,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconBattery, IconBolt, IconSun } from '@tabler/icons-react';
import { computeSystem } from '@shared/engine';
import type { BatteryConfig, GeneratorConfig, GeneratorMode, SolarConfig } from '@shared/types';
import { useProjectStore } from '@renderer/state/projectStore';

const DEFAULT_GEN: GeneratorConfig = { enabled: false, backupFraction: 1, mode: 'standby' };
const DEFAULT_SOLAR: SolarConfig = { enabled: false, targetKwp: 50, panelWp: 550, dcAcRatio: 1.2 };
const DEFAULT_BATT: BatteryConfig = { enabled: false, backupKw: 10, autonomyHours: 4, chemistry: 'lifepo4' };

/** Computed-result strip shown under an enabled source. */
function ResultBlock({ stats, note }: { stats: [string, string][]; note: string }) {
  return (
    <Card withBorder mt="sm" padding="sm" radius="sm" bg="var(--mantine-color-default-hover)">
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
        {stats.map(([k, v]) => (
          <div key={k}>
            <Text size="xs" c="dimmed">
              {k}
            </Text>
            <Text size="sm" fw={700}>
              {v}
            </Text>
          </div>
        ))}
      </SimpleGrid>
      <Text size="xs" c="dimmed" mt="xs">
        {note}
      </Text>
    </Card>
  );
}

function SourceHeader({
  icon,
  title,
  enabled,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <Group justify="space-between">
      <Group gap="xs">
        <ThemeIcon variant="light" color={enabled ? 'indigo' : 'gray'}>
          {icon}
        </ThemeIcon>
        <Text fw={600}>{title}</Text>
      </Group>
      <Switch checked={enabled} onChange={(e) => onToggle(e.currentTarget.checked)} />
    </Group>
  );
}

/** Configure distributed energy sources and see them sized against the demand. */
export function Sources() {
  const project = useProjectStore((s) => s.project);
  const updateSources = useProjectStore((s) => s.updateSources);
  const system = useMemo(() => computeSystem(project), [project]);

  const gen: GeneratorConfig = { ...DEFAULT_GEN, ...project.sources?.generator };
  const solar: SolarConfig = { ...DEFAULT_SOLAR, ...project.sources?.solar };
  const batt: BatteryConfig = { ...DEFAULT_BATT, ...project.sources?.battery };
  const res = system.sources;

  const setGen = (p: Partial<GeneratorConfig>) => updateSources({ generator: { ...gen, ...p } });
  const setSolar = (p: Partial<SolarConfig>) => updateSources({ solar: { ...solar, ...p } });
  const setBatt = (p: Partial<BatteryConfig>) => updateSources({ battery: { ...batt, ...p } });

  return (
    <Stack gap="md">
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Power sources
        </Text>
        <Title order={3}>Energy sources</Title>
        <Text size="sm" c="dimmed">
          Building demand: <b>{system.supply.demandKva} kVA</b>. Enable backup and renewable sources
          to size them against it.
        </Text>
      </div>

      {/* Generator */}
      <Card withBorder radius="md" padding="md">
        <SourceHeader
          icon={<IconBolt size={16} />}
          title="Generator (genset)"
          enabled={gen.enabled}
          onToggle={(v) => setGen({ enabled: v })}
        />
        {gen.enabled && (
          <>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mt="sm">
              <NumberInput
                label="Backup of demand (%)"
                value={Math.round(gen.backupFraction * 100)}
                min={10}
                max={100}
                step={5}
                onChange={(v) => setGen({ backupFraction: (typeof v === 'number' ? v : 100) / 100 })}
              />
              <div>
                <Text size="sm" fw={500} mb={4}>
                  Duty
                </Text>
                <SegmentedControl
                  fullWidth
                  data={[
                    { value: 'standby', label: 'Standby' },
                    { value: 'prime', label: 'Prime' },
                  ]}
                  value={gen.mode}
                  onChange={(v) => setGen({ mode: v as GeneratorMode })}
                />
              </div>
            </SimpleGrid>
            {res?.generator && (
              <ResultBlock
                note={res.generator.note}
                stats={[
                  ['Genset rating', `${res.generator.ratingKva} kVA`],
                  ['Backup load', `${res.generator.backupKva} kVA`],
                  ['Duty', res.generator.mode],
                ]}
              />
            )}
          </>
        )}
      </Card>

      {/* Solar PV */}
      <Card withBorder radius="md" padding="md">
        <SourceHeader
          icon={<IconSun size={16} />}
          title="Solar PV + inverter"
          enabled={solar.enabled}
          onToggle={(v) => setSolar({ enabled: v })}
        />
        {solar.enabled && (
          <>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mt="sm">
              <NumberInput
                label="Target array (kWp)"
                value={solar.targetKwp}
                min={1}
                step={5}
                onChange={(v) => setSolar({ targetKwp: typeof v === 'number' ? v : solar.targetKwp })}
              />
              <NumberInput
                label="Panel power (Wp)"
                value={solar.panelWp}
                min={100}
                step={10}
                onChange={(v) => setSolar({ panelWp: typeof v === 'number' ? v : solar.panelWp })}
              />
              <NumberInput
                label="DC/AC ratio"
                value={solar.dcAcRatio}
                min={1}
                max={1.5}
                step={0.05}
                decimalScale={2}
                onChange={(v) => setSolar({ dcAcRatio: typeof v === 'number' ? v : solar.dcAcRatio })}
              />
            </SimpleGrid>
            {res?.solar && (
              <ResultBlock
                note={res.solar.note}
                stats={[
                  ['Panels', `${res.solar.panelCount} × ${res.solar.panelWp} Wp`],
                  ['Array', `${res.solar.arrayKwp} kWp`],
                  ['Inverter', `${res.solar.inverterKw} kW`],
                  ['Strings', `${res.solar.strings} × ${res.solar.stringSize}`],
                  ['Daily yield', `${res.solar.dailyKwh} kWh`],
                ]}
              />
            )}
          </>
        )}
      </Card>

      {/* Battery */}
      <Card withBorder radius="md" padding="md">
        <SourceHeader
          icon={<IconBattery size={16} />}
          title="Backup battery + inverter"
          enabled={batt.enabled}
          onToggle={(v) => setBatt({ enabled: v })}
        />
        {batt.enabled && (
          <>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mt="sm">
              <NumberInput
                label="Backup load (kW)"
                value={batt.backupKw}
                min={1}
                step={1}
                onChange={(v) => setBatt({ backupKw: typeof v === 'number' ? v : batt.backupKw })}
              />
              <NumberInput
                label="Autonomy (hours)"
                value={batt.autonomyHours}
                min={0.5}
                step={0.5}
                decimalScale={1}
                onChange={(v) =>
                  setBatt({ autonomyHours: typeof v === 'number' ? v : batt.autonomyHours })
                }
              />
              <Select
                label="Chemistry"
                data={[
                  { value: 'lifepo4', label: 'LiFePO4' },
                  { value: 'lead_acid', label: 'Lead-acid' },
                ]}
                value={batt.chemistry}
                allowDeselect={false}
                onChange={(v) => v && setBatt({ chemistry: v as BatteryConfig['chemistry'] })}
              />
            </SimpleGrid>
            {res?.battery && (
              <ResultBlock
                note={res.battery.note}
                stats={[
                  ['Required', `${res.battery.requiredKwh} kWh`],
                  ['Installed', `${res.battery.installedKwh} kWh`],
                  ['Modules', `${res.battery.moduleCount} × ${res.battery.moduleKwh} kWh`],
                  ['Inverter', `${res.battery.inverterKw} kW`],
                ]}
              />
            )}
          </>
        )}
      </Card>
    </Stack>
  );
}
