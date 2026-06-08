import { ActionIcon, Button, Group, NumberInput, Select, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { CircuitInput, LoadKind, StarterType } from '@shared/types';
import { useProjectStore } from '@renderer/state/projectStore';

/** Load-kind options for the editable Select. */
const LOAD_KIND_OPTIONS: { value: LoadKind; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'motor', label: 'Motor' },
  { value: 'pump', label: 'Pump' },
  { value: 'feeder', label: 'Feeder' },
];

/** Starter-type options, shown only for motor/pump circuits. */
const STARTER_OPTIONS: { value: StarterType; label: string }[] = [
  { value: 'DOL', label: 'DOL (direct on-line)' },
  { value: 'STAR_DELTA', label: 'Star-delta (Y-Δ)' },
  { value: 'REVERSING', label: 'Reversing' },
  { value: 'SOFT_STARTER', label: 'Soft starter' },
  { value: 'VFD', label: 'VFD' },
  { value: 'PUMP', label: 'Pump controller' },
];

/** True for circuits whose sizing is driven by motor kW rather than connected W. */
function isMotorKind(kind: LoadKind): boolean {
  return kind === 'motor' || kind === 'pump';
}

interface RowProps {
  panelId: string;
  circuit: CircuitInput;
}

/** A single editable circuit row. Edits dispatch immutable store updates. */
function CircuitRow({ panelId, circuit }: RowProps) {
  const updateCircuit = useProjectStore((s) => s.updateCircuit);
  const removeCircuit = useProjectStore((s) => s.removeCircuit);

  const motor = isMotorKind(circuit.loadKind);

  const patch = (p: Partial<CircuitInput>) => updateCircuit(panelId, circuit.id, p);

  return (
    <Table.Tr>
      <Table.Td>
        <TextInput
          value={circuit.name}
          size="xs"
          variant="filled"
          onChange={(e) => patch({ name: e.currentTarget.value })}
        />
      </Table.Td>

      <Table.Td>
        <Select
          data={LOAD_KIND_OPTIONS}
          value={circuit.loadKind}
          size="xs"
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          onChange={(value) => {
            if (!value) return;
            const kind = value as LoadKind;
            // Keep dependent flags coherent when switching kinds.
            patch({
              loadKind: kind,
              isLighting: kind === 'lighting',
              ...(isMotorKind(kind)
                ? { motorKw: circuit.motorKw ?? 5.5, starterType: circuit.starterType ?? 'DOL' }
                : {}),
            });
          }}
        />
      </Table.Td>

      <Table.Td>
        {motor ? (
          <NumberInput
            value={circuit.motorKw ?? 0}
            size="xs"
            min={0}
            step={0.5}
            decimalScale={1}
            suffix=" kW"
            onChange={(v) => patch({ motorKw: typeof v === 'number' ? v : 0 })}
          />
        ) : (
          <NumberInput
            value={circuit.loadW / 1000}
            size="xs"
            min={0}
            step={0.5}
            decimalScale={2}
            suffix=" kW"
            onChange={(v) => patch({ loadW: (typeof v === 'number' ? v : 0) * 1000 })}
          />
        )}
      </Table.Td>

      <Table.Td>
        <NumberInput
          value={circuit.lengthM}
          size="xs"
          min={0}
          step={5}
          suffix=" m"
          onChange={(v) => patch({ lengthM: typeof v === 'number' ? v : 0 })}
        />
      </Table.Td>

      <Table.Td>
        <NumberInput
          value={circuit.cosPhi}
          size="xs"
          min={0.1}
          max={1}
          step={0.05}
          decimalScale={2}
          onChange={(v) => patch({ cosPhi: typeof v === 'number' ? v : circuit.cosPhi })}
        />
      </Table.Td>

      <Table.Td>
        {motor ? (
          <Select
            data={STARTER_OPTIONS}
            value={circuit.starterType ?? 'DOL'}
            size="xs"
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            onChange={(value) => value && patch({ starterType: value as StarterType })}
          />
        ) : (
          <Text size="xs" c="dimmed" ta="center">
            —
          </Text>
        )}
      </Table.Td>

      <Table.Td>
        <Tooltip label="Delete circuit">
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label="Delete circuit"
            onClick={() => removeCircuit(panelId, circuit.id)}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      </Table.Td>
    </Table.Tr>
  );
}

/** Structured editor for a panel's branch circuits; recomputes the panel live. */
export function CircuitTable({ panelId }: { panelId: string }) {
  const circuits = useProjectStore(
    (s) => s.project.panels.find((p) => p.id === panelId)?.circuits ?? [],
  );
  const addCircuit = useProjectStore((s) => s.addCircuit);

  const branches = circuits.filter((c) => c.role === 'branch');

  return (
    <div>
      <Table.ScrollContainer minWidth={680}>
        <Table verticalSpacing="xs" highlightOnHover stickyHeader>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th w={130}>Kind</Table.Th>
              <Table.Th w={120}>Load</Table.Th>
              <Table.Th w={100}>Length</Table.Th>
              <Table.Th w={80}>pf</Table.Th>
              <Table.Th w={160}>Starter</Table.Th>
              <Table.Th w={44} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {branches.map((c) => (
              <CircuitRow key={c.id} panelId={panelId} circuit={c} />
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {branches.length === 0 && (
        <Text c="dimmed" size="sm" ta="center" py="md">
          No branch circuits yet. Add one to start sizing.
        </Text>
      )}

      <Group justify="flex-start" mt="sm">
        <Button
          leftSection={<IconPlus size={16} />}
          variant="light"
          size="xs"
          onClick={() => addCircuit(panelId)}
        >
          Add circuit
        </Button>
      </Group>
    </div>
  );
}
