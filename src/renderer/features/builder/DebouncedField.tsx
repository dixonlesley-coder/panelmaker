/**
 * Debounced wrappers around Mantine's text/number inputs.
 *
 * Editing a circuit field used to call the store on EVERY keystroke, and because
 * the whole building engine recomputes on each project change (and the canvas
 * rebuilds every node), typing felt heavy on a large project. These keep the
 * field instant via local state and commit to the store on a short debounce (and
 * on blur), so the engine/canvas catch up a beat after you pause — not per key.
 *
 * The field re-syncs from the incoming value whenever it changes while NOT being
 * edited (undo/redo, external edits), so it never goes stale.
 */

import { useEffect, useRef, useState } from 'react';
import { NumberInput, TextInput, type NumberInputProps, type TextInputProps } from '@mantine/core';

const COMMIT_DELAY_MS = 200;

type NumProps = Omit<NumberInputProps, 'value' | 'onChange'> & {
  value: number;
  onCommit: (value: number) => void;
};

export function DebouncedNumberInput({ value, onCommit, ...rest }: NumProps) {
  const [local, setLocal] = useState<number | string>(value);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync from outside only when this field isn't being actively edited.
  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const flush = (raw: number | string) => {
    const n = typeof raw === 'number' ? raw : Number(raw);
    onCommit(Number.isFinite(n) ? n : value);
  };

  return (
    <NumberInput
      {...rest}
      value={local}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        if (timer.current) clearTimeout(timer.current);
        flush(local);
      }}
      onChange={(v) => {
        setLocal(v);
        if (timer.current) clearTimeout(timer.current);
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(n)) timer.current = setTimeout(() => flush(n), COMMIT_DELAY_MS);
      }}
    />
  );
}

type TxtProps = Omit<TextInputProps, 'value' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void;
};

export function DebouncedTextInput({ value, onCommit, ...rest }: TxtProps) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <TextInput
      {...rest}
      value={local}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        if (timer.current) clearTimeout(timer.current);
        onCommit(local);
      }}
      onChange={(e) => {
        const v = e.currentTarget.value;
        setLocal(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => onCommit(v), COMMIT_DELAY_MS);
      }}
    />
  );
}
