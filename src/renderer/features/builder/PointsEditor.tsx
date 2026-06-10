import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type {
  CircuitInput,
  LightFixture,
  SmartProtocol,
  SocketOutlet,
  SwitchGroup,
} from '@shared/types';
import { VA_PER_SOCKET_POINT } from '@shared/standards/fixtures';
import { useProjectStore } from '@renderer/state/projectStore';

/** Collision-resistant id for fixture/switch/socket rows (persisted with the project). */
function rid(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
}

const PROTOCOLS: { value: SmartProtocol; label: string }[] = [
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'zigbee', label: 'Zigbee' },
  { value: 'relay_bus', label: 'Relay bus' },
  { value: 'knx', label: 'KNX' },
];

interface Props {
  panelId: string;
  circuit: CircuitInput;
  opened: boolean;
  onClose: () => void;
}

/**
 * Point-level editor for a final circuit: light-fixture rows grouped onto
 * conventional/smart switches, or socket-outlet rows. Edits are staged locally
 * and committed once on Save (one undo step; no per-keystroke history churn).
 */
export function PointsEditor({ panelId, circuit, opened, onClose }: Props) {
  const { t } = useTranslation();
  const updateCircuit = useProjectStore((s) => s.updateCircuit);

  const lighting = circuit.loadKind === 'lighting';
  const [fixtures, setFixtures] = useState<LightFixture[]>(circuit.fixtures ?? []);
  const [groups, setGroups] = useState<SwitchGroup[]>(circuit.switchGroups ?? []);
  const [sockets, setSockets] = useState<SocketOutlet[]>(circuit.sockets ?? []);

  const totalW = useMemo(
    () =>
      fixtures.reduce((s, f) => s + Math.max(0, f.wattsPerFitting) * Math.max(0, f.qty), 0) +
      sockets.reduce(
        (s, x) => s + Math.max(0, x.qty) * Math.max(0, x.vaPerPoint ?? VA_PER_SOCKET_POINT),
        0,
      ),
    [fixtures, sockets],
  );
  const pointCount = useMemo(
    () =>
      fixtures.reduce((n, f) => n + Math.max(0, f.qty), 0) +
      sockets.reduce((n, s) => n + Math.max(0, s.qty), 0),
    [fixtures, sockets],
  );

  const patchFixture = (id: string, p: Partial<LightFixture>) =>
    setFixtures((rows) => rows.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const patchGroup = (id: string, p: Partial<SwitchGroup>) =>
    setGroups((rows) => rows.map((g) => (g.id === id ? { ...g, ...p } : g)));
  const patchSocket = (id: string, p: Partial<SocketOutlet>) =>
    setSockets((rows) => rows.map((s) => (s.id === id ? { ...s, ...p } : s)));

  const save = () => {
    updateCircuit(panelId, circuit.id, {
      fixtures: fixtures.length > 0 ? fixtures : undefined,
      switchGroups: groups.length > 0 ? groups : undefined,
      sockets: sockets.length > 0 ? sockets : undefined,
    });
    onClose();
  };

  const groupOptions = groups.map((g) => ({ value: g.id, label: g.label }));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      title={
        <Group gap="xs">
          <Text fw={600}>{t('points.title', { name: circuit.name })}</Text>
          <Badge variant="light" color="indigo">
            {t('points.summary', { points: pointCount, kw: (totalW / 1000).toFixed(2) })}
          </Badge>
        </Group>
      }
    >
      <Stack gap="md">
        {lighting && (
          <>
            {/* ---------------- Switch groups ---------------- */}
            <div>
              <Group justify="space-between" mb={6}>
                <Text fw={600} size="sm">
                  {t('points.switches')}
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={() =>
                    setGroups((g) => [
                      ...g,
                      {
                        id: rid('sw'),
                        label: `SW${g.length + 1}`,
                        kind: 'conventional',
                        gang: 1,
                        ways: 1,
                      },
                    ])
                  }
                >
                  {t('points.addSwitch')}
                </Button>
              </Group>
              {groups.length === 0 ? (
                <Text size="xs" c="dimmed">
                  {t('points.noSwitches')}
                </Text>
              ) : (
                <Stack gap="xs">
                  {groups.map((g) => (
                    <Group key={g.id} gap="xs" align="flex-end" wrap="wrap">
                      <TextInput
                        label={t('points.switchLabel')}
                        size="xs"
                        w={150}
                        value={g.label}
                        onChange={(e) => patchGroup(g.id, { label: e.currentTarget.value })}
                      />
                      <div>
                        <Text size="xs" fw={500} mb={2}>
                          {t('points.switchKind')}
                        </Text>
                        <SegmentedControl
                          size="xs"
                          data={[
                            { value: 'conventional', label: t('points.conventional') },
                            { value: 'smart', label: t('points.smart') },
                          ]}
                          value={g.kind}
                          onChange={(v) =>
                            patchGroup(
                              g.id,
                              v === 'smart'
                                ? { kind: 'smart', protocol: g.protocol ?? 'wifi', gang: undefined, ways: undefined }
                                : { kind: 'conventional', gang: g.gang ?? 1, ways: g.ways ?? 1, protocol: undefined, neutralAtSwitch: undefined },
                            )
                          }
                        />
                      </div>
                      {g.kind === 'conventional' ? (
                        <>
                          <NumberInput
                            label={t('points.gang')}
                            size="xs"
                            w={90}
                            min={1}
                            max={4}
                            value={g.gang ?? 1}
                            onChange={(v) => patchGroup(g.id, { gang: typeof v === 'number' ? v : 1 })}
                          />
                          <Select
                            label={t('points.ways')}
                            size="xs"
                            w={110}
                            data={[
                              { value: '1', label: t('points.oneWay') },
                              { value: '2', label: t('points.twoWay') },
                            ]}
                            value={String(g.ways ?? 1)}
                            allowDeselect={false}
                            onChange={(v) => patchGroup(g.id, { ways: v === '2' ? 2 : 1 })}
                          />
                        </>
                      ) : (
                        <>
                          <Select
                            label={t('points.protocol')}
                            size="xs"
                            w={120}
                            data={PROTOCOLS}
                            value={g.protocol ?? 'wifi'}
                            allowDeselect={false}
                            onChange={(v) => v && patchGroup(g.id, { protocol: v as SmartProtocol })}
                          />
                          <Switch
                            label={t('points.neutralAtSwitch')}
                            size="xs"
                            checked={g.neutralAtSwitch ?? true}
                            onChange={(e) =>
                              patchGroup(g.id, { neutralAtSwitch: e.currentTarget.checked })
                            }
                          />
                        </>
                      )}
                      <Tooltip label={t('points.removeSwitch')}>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={t('points.removeSwitch')}
                          onClick={() => {
                            setGroups((rows) => rows.filter((x) => x.id !== g.id));
                            // Unassign fixtures that pointed at the removed switch.
                            setFixtures((rows) =>
                              rows.map((f) =>
                                f.switchGroupId === g.id ? { ...f, switchGroupId: undefined } : f,
                              ),
                            );
                          }}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  ))}
                </Stack>
              )}
            </div>

            <Divider />

            {/* ---------------- Fixtures ---------------- */}
            <div>
              <Group justify="space-between" mb={6}>
                <Text fw={600} size="sm">
                  {t('points.fixtures')}
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={() =>
                    setFixtures((rows) => [
                      ...rows,
                      {
                        id: rid('fx'),
                        name: t('points.newFixture'),
                        wattsPerFitting: 12,
                        qty: 1,
                        switchGroupId: groups[0]?.id,
                      },
                    ])
                  }
                >
                  {t('points.addFixture')}
                </Button>
              </Group>
              {fixtures.length === 0 ? (
                <Text size="xs" c="dimmed">
                  {t('points.noFixtures')}
                </Text>
              ) : (
                <Table verticalSpacing={4} withRowBorders={false}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('points.fixtureName')}</Table.Th>
                      <Table.Th w={110}>{t('points.wattsEach')}</Table.Th>
                      <Table.Th w={90}>{t('points.qty')}</Table.Th>
                      <Table.Th w={170}>{t('points.controlledBy')}</Table.Th>
                      <Table.Th w={44} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {fixtures.map((f) => (
                      <Table.Tr key={f.id}>
                        <Table.Td>
                          <TextInput
                            size="xs"
                            value={f.name}
                            onChange={(e) => patchFixture(f.id, { name: e.currentTarget.value })}
                          />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            size="xs"
                            min={0}
                            suffix=" W"
                            value={f.wattsPerFitting}
                            onChange={(v) =>
                              patchFixture(f.id, { wattsPerFitting: typeof v === 'number' ? v : 0 })
                            }
                          />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            size="xs"
                            min={1}
                            value={f.qty}
                            onChange={(v) => patchFixture(f.id, { qty: typeof v === 'number' ? v : 1 })}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Select
                            size="xs"
                            data={groupOptions}
                            value={f.switchGroupId ?? null}
                            placeholder={t('points.unswitched')}
                            clearable
                            comboboxProps={{ withinPortal: true }}
                            onChange={(v) => patchFixture(f.id, { switchGroupId: v ?? undefined })}
                          />
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            aria-label={t('points.removeFixture')}
                            onClick={() => setFixtures((rows) => rows.filter((x) => x.id !== f.id))}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </div>
          </>
        )}

        {!lighting && (
          <div>
            <Group justify="space-between" mb={6}>
              <Text fw={600} size="sm">
                {t('points.sockets')}
              </Text>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={() =>
                  setSockets((rows) => [
                    ...rows,
                    { id: rid('so'), name: t('points.newSocket'), qty: 1, type: 'general' },
                  ])
                }
              >
                {t('points.addSocket')}
              </Button>
            </Group>
            <Text size="xs" c="dimmed" mb={6}>
              {t('points.socketsHint', { va: VA_PER_SOCKET_POINT })}
            </Text>
            {sockets.length === 0 ? (
              <Text size="xs" c="dimmed">
                {t('points.noSockets')}
              </Text>
            ) : (
              <Table verticalSpacing={4} withRowBorders={false}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('points.socketName')}</Table.Th>
                    <Table.Th w={90}>{t('points.qty')}</Table.Th>
                    <Table.Th w={120}>{t('points.vaPerPoint')}</Table.Th>
                    <Table.Th w={140}>{t('points.socketType')}</Table.Th>
                    <Table.Th w={44} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {sockets.map((s) => (
                    <Table.Tr key={s.id}>
                      <Table.Td>
                        <TextInput
                          size="xs"
                          value={s.name}
                          onChange={(e) => patchSocket(s.id, { name: e.currentTarget.value })}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          size="xs"
                          min={1}
                          value={s.qty}
                          onChange={(v) => patchSocket(s.id, { qty: typeof v === 'number' ? v : 1 })}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          size="xs"
                          min={0}
                          step={50}
                          suffix=" VA"
                          placeholder={String(VA_PER_SOCKET_POINT)}
                          value={s.vaPerPoint ?? ''}
                          onChange={(v) =>
                            patchSocket(s.id, { vaPerPoint: typeof v === 'number' ? v : undefined })
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <Select
                          size="xs"
                          data={[
                            { value: 'general', label: t('points.socketGeneral') },
                            { value: 'dedicated', label: t('points.socketDedicated') },
                          ]}
                          value={s.type ?? 'general'}
                          allowDeselect={false}
                          comboboxProps={{ withinPortal: true }}
                          onChange={(v) => {
                            const type = (v as 'general' | 'dedicated') ?? 'general';
                            // A dedicated outlet usually carries a real appliance
                            // load — seed a sensible editable value when none set.
                            patchSocket(s.id, {
                              type,
                              ...(type === 'dedicated' && s.vaPerPoint === undefined
                                ? { vaPerPoint: 1000 }
                                : {}),
                            });
                          }}
                        />
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={t('points.removeSocket')}
                          onClick={() => setSockets((rows) => rows.filter((x) => x.id !== s.id))}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </div>
        )}

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {t('points.derivedHint')}
          </Text>
          <Group gap="xs">
            <Button variant="default" size="xs" onClick={onClose}>
              {t('points.cancel')}
            </Button>
            <Button size="xs" onClick={save}>
              {t('points.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
