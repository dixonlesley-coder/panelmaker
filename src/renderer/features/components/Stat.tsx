import type { ReactNode } from 'react';
import { Card, Group, Text, ThemeIcon } from '@mantine/core';

export interface StatProps {
  label: string;
  value: ReactNode;
  /** Optional secondary line under the value. */
  hint?: ReactNode;
  /** Optional leading icon element. */
  icon?: ReactNode;
  /** Mantine color for the icon chip. */
  color?: string;
}

/** A compact metric card: label, large value, optional hint and icon. */
export function Stat({ label, value, hint, icon, color = 'indigo' }: StatProps) {
  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {label}
          </Text>
          <Text size="xl" fw={700} mt={4} lh={1.2}>
            {value}
          </Text>
          {hint && (
            <Text size="xs" c="dimmed" mt={2}>
              {hint}
            </Text>
          )}
        </div>
        {icon && (
          <ThemeIcon variant="light" color={color} size="lg" radius="md">
            {icon}
          </ThemeIcon>
        )}
      </Group>
    </Card>
  );
}
