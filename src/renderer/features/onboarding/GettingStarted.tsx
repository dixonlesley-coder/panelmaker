/**
 * A friendly, dismissible "Getting started" card shown at the top of the canvas
 * for a brand-new project. It walks a first-time user through the first handful
 * of steps to their first panel design, with a check next to each completed one
 * and a small progress bar.
 *
 * It is deliberately PRESENTATIONAL: every bit of state (the steps, whether each
 * is done, what clicking it does, and how to dismiss the card) is supplied by the
 * caller via props, so it touches no store and no i18n files. The orchestrator
 * computes the steps from project state and wires the click handlers.
 */

import { ActionIcon, Box, Card, Group, Progress, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconCircle, IconCircleCheck, IconX } from '@tabler/icons-react';

/** One row in the getting-started checklist. */
export interface OnboardingStep {
  /** Stable id (used as the React key). */
  id: string;
  /** Short, friendly label, e.g. "Set up your service". */
  label: string;
  /** Optional one-line hint shown dimmed below the label. */
  hint?: string;
  /** Whether the step is already satisfied by the current project state. */
  done: boolean;
  /** Invoked when the row is clicked (e.g. open an inspector). */
  onClick?: () => void;
}

/** EN + ID copy, inline so the card needs no i18n resources. */
const COPY = {
  en: {
    title: 'Getting started',
    subtitle: 'A few steps to your first panel design',
    dismiss: 'Dismiss',
    progress: (done: number, total: number) => `${done} / ${total} done`,
  },
  id: {
    title: 'Mulai cepat',
    subtitle: 'Beberapa langkah menuju desain panel pertama Anda',
    dismiss: 'Tutup',
    progress: (done: number, total: number) => `${done} / ${total} selesai`,
  },
} as const;

function StepRow({ step }: { step: OnboardingStep }) {
  return (
    <UnstyledButton
      onClick={step.onClick}
      disabled={step.onClick === undefined}
      style={{
        display: 'block',
        width: '100%',
        borderRadius: 'var(--mantine-radius-sm)',
        padding: '6px 8px',
        cursor: step.onClick ? 'pointer' : 'default',
      }}
      // A subtle hover so the row reads as clickable without shouting.
      onMouseEnter={(e) => {
        if (step.onClick) e.currentTarget.style.backgroundColor = 'var(--mantine-color-default-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        {step.done ? (
          <ThemeIcon size={22} radius="xl" variant="light" color="teal">
            <IconCircleCheck size={16} />
          </ThemeIcon>
        ) : (
          <ThemeIcon size={22} radius="xl" variant="subtle" color="gray">
            <IconCircle size={16} />
          </ThemeIcon>
        )}
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text
            size="sm"
            fw={500}
            c={step.done ? 'dimmed' : undefined}
            td={step.done ? 'line-through' : undefined}
          >
            {step.label}
          </Text>
          {step.hint ? (
            <Text size="xs" c="dimmed">
              {step.hint}
            </Text>
          ) : null}
        </Box>
      </Group>
    </UnstyledButton>
  );
}

/**
 * The getting-started card. Pure props in, friendly checklist out.
 *
 * @param steps      The ordered checklist; each may carry an onClick.
 * @param onDismiss  Called when the user closes the card (the "×").
 * @param lang       'en' (default) or 'id' for the inline copy.
 */
export function GettingStarted({
  steps,
  onDismiss,
  lang = 'en',
}: {
  steps: OnboardingStep[];
  onDismiss: () => void;
  lang?: 'en' | 'id';
}): JSX.Element {
  const copy = lang === 'id' ? COPY.id : COPY.en;
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Card
      withBorder
      radius="md"
      padding="md"
      // A gentle accent tint so it draws the eye without feeling like an error.
      style={{ backgroundColor: 'var(--mantine-color-blue-light)' }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="xs">
        <Box style={{ minWidth: 0 }}>
          <Text fw={600}>{copy.title}</Text>
          <Text size="sm" c="dimmed">
            {copy.subtitle}
          </Text>
        </Box>
        <ActionIcon variant="subtle" color="gray" aria-label={copy.dismiss} onClick={onDismiss}>
          <IconX size={16} />
        </ActionIcon>
      </Group>

      <Group justify="space-between" align="center" gap="sm" mb={6}>
        <Text size="xs" c="dimmed" fw={500}>
          {copy.progress(done, total)}
        </Text>
      </Group>
      <Progress value={pct} size="sm" radius="xl" color="teal" mb="sm" aria-label={copy.progress(done, total)} />

      <Stack gap={2}>
        {steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </Stack>
    </Card>
  );
}
