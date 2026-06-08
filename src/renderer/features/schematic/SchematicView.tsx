import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Select,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconLockOpen, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { PanelInput, PanelResult, SchematicSymbolType } from '@shared/types';
import { useProjectStore } from '@renderer/state/projectStore';
import { SchematicCanvas } from './SchematicCanvas';

const PALETTE_SYMBOLS: { type: SchematicSymbolType; label: string }[] = [
  { type: 'no-contact', label: 'NO contact' },
  { type: 'nc-contact', label: 'NC contact' },
  { type: 'coil', label: 'Coil' },
  { type: 'lamp', label: 'Lamp' },
  { type: 'pushbutton-no', label: 'Push (NO)' },
  { type: 'pushbutton-nc', label: 'Push (NC)' },
  { type: 'timer-contact-on', label: 'Timer' },
  { type: 'overload-contact', label: 'Overload' },
];

/**
 * The "Control Schematic" tab: pick a motor/pump circuit, auto-generate its
 * ladder, regenerate (preserving manual rungs), and freely add custom rungs +
 * symbols. Generated rungs are locked until detached.
 */
export function SchematicView({ result }: { panel: PanelInput; result: PanelResult }) {
  const schematics = useProjectStore((s) => s.schematics);
  const ensureSchematic = useProjectStore((s) => s.ensureSchematic);
  const regenerateSchematic = useProjectStore((s) => s.regenerateSchematic);
  const addRung = useProjectStore((s) => s.addRung);
  const addSymbol = useProjectStore((s) => s.addSymbol);
  const removeRung = useProjectStore((s) => s.removeRung);
  const removeSymbol = useProjectStore((s) => s.removeSymbol);
  const detachRung = useProjectStore((s) => s.detachRung);

  const controlCircuits = result.circuits.filter((c) => c.control);
  const [circuitId, setCircuitId] = useState<string | undefined>(controlCircuits[0]?.circuitId);
  const [selRung, setSelRung] = useState<string | undefined>();
  const [selSym, setSelSym] = useState<string | undefined>();

  // keep the selected circuit valid as the panel changes
  useEffect(() => {
    if (!controlCircuits.some((c) => c.circuitId === circuitId)) {
      setCircuitId(controlCircuits[0]?.circuitId);
      setSelRung(undefined);
      setSelSym(undefined);
    }
  }, [controlCircuits, circuitId]);

  const active = controlCircuits.find((c) => c.circuitId === circuitId);
  const assembly = active?.control;

  // generate the schematic the first time a circuit is shown
  useEffect(() => {
    if (circuitId && assembly) ensureSchematic(circuitId, assembly);
  }, [circuitId, assembly, ensureSchematic]);

  if (controlCircuits.length === 0) {
    return (
      <Alert color="gray" title="No control circuits">
        This panel has no motor/pump control circuits. Add one in the builder by setting a
        circuit&apos;s type to <b>motor</b> or <b>pump</b> and choosing a starter.
      </Alert>
    );
  }

  const schematic = circuitId ? schematics[circuitId] : undefined;
  const selectedRung = schematic?.rungs.find((r) => r.id === selRung);
  const circuitOptions = controlCircuits.map((c) => ({
    value: c.circuitId,
    label: `${c.name} · ${c.control!.starterType.replace('_', '-')}`,
  }));

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end">
        <Select
          label="Control circuit"
          data={circuitOptions}
          value={circuitId ?? null}
          allowDeselect={false}
          onChange={(v) => {
            if (v) {
              setCircuitId(v);
              setSelRung(undefined);
              setSelSym(undefined);
            }
          }}
          w={320}
        />
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            leftSection={<IconRefresh size={14} />}
            onClick={() => {
              if (circuitId && assembly) {
                regenerateSchematic(circuitId, assembly);
                notifications.show({
                  message: 'Schematic regenerated — manual rungs preserved.',
                  color: 'indigo',
                });
              }
            }}
          >
            Regenerate
          </Button>
          <Button
            size="xs"
            variant="light"
            color="teal"
            leftSection={<IconPlus size={14} />}
            onClick={() => circuitId && addRung(circuitId)}
          >
            Add rung
          </Button>
        </Group>
      </Group>

      {schematic && (
        <SchematicCanvas
          schematic={schematic}
          selectedRungId={selRung}
          selectedSymbolId={selSym}
          onSelectRung={(id) => {
            setSelRung(id);
            setSelSym(undefined);
          }}
          onSelectSymbol={(id) => {
            setSelSym(id);
            const sym = schematic.symbols.find((s) => s.id === id);
            setSelRung(sym?.rungId);
          }}
        />
      )}

      {selectedRung && (
        <Box>
          <Divider
            mb="xs"
            label={
              <Group gap={6}>
                <Text size="xs">{selectedRung.label}</Text>
                <Badge size="xs" variant="light" color={selectedRung.generated ? 'indigo' : 'teal'}>
                  {selectedRung.generated ? 'auto-generated' : 'manual'}
                </Badge>
              </Group>
            }
          />
          {selectedRung.generated ? (
            <Group gap="xs">
              <Text size="xs" c="dimmed">
                Generated rung — detach it to edit and keep it across regeneration.
              </Text>
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconLockOpen size={14} />}
                onClick={() => circuitId && detachRung(circuitId, selectedRung.id)}
              >
                Detach
              </Button>
            </Group>
          ) : (
            <Group gap="xs">
              {PALETTE_SYMBOLS.map((p) => (
                <Button
                  key={p.type}
                  size="xs"
                  variant="default"
                  onClick={() => circuitId && addSymbol(circuitId, selectedRung.id, p.type)}
                >
                  {p.label}
                </Button>
              ))}
              {selSym && (
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => {
                    if (circuitId && selSym) {
                      removeSymbol(circuitId, selSym);
                      setSelSym(undefined);
                    }
                  }}
                >
                  Remove symbol
                </Button>
              )}
              <Tooltip label="Delete this rung">
                <ActionIcon
                  variant="light"
                  color="red"
                  onClick={() => {
                    if (circuitId) {
                      removeRung(circuitId, selectedRung.id);
                      setSelRung(undefined);
                      setSelSym(undefined);
                    }
                  }}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
        </Box>
      )}
    </Stack>
  );
}
