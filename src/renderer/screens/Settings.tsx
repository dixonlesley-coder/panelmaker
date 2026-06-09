import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Group,
  Image,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBuildingFactory2,
  IconInfoCircle,
  IconLock,
  IconPhoto,
  IconRefresh,
  IconShieldBolt,
  IconX,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { computeSystem } from '@shared/engine';
import { EARTHING_SYSTEMS } from '@shared/standards';
import type { EarthingSystem, InstallMethod } from '@shared/types';
import { useProjectStore } from '@renderer/state/projectStore';
import {
  appVersion,
  checkForUpdates,
  isDesktop,
  licenseSignOut,
  licenseStatus,
} from '@renderer/api';
import type { LicenseStatusResult } from '@shared/ipc-contract';
import { getLanguage, setLanguage, type Language } from '@renderer/i18n';

/** Install-method values for the panel default Select (labels are translated). */
const INSTALL_METHOD_VALUES: InstallMethod[] = [
  'conduit',
  'trunking',
  'wall',
  'air',
  'tray',
  'buried',
];

/** Language options for the UI-language Select. */
const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'id', label: 'Bahasa Indonesia' },
];

export function Settings() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const activePanelId = useProjectStore((s) => s.activePanelId);
  const updatePanel = useProjectStore((s) => s.updatePanel);
  const setEarthingSystem = useProjectStore((s) => s.setEarthingSystem);
  const setProjectMeta = useProjectStore((s) => s.setProjectMeta);

  const panel = project.panels.find((p) => p.id === activePanelId);
  const meta = project.meta ?? {};
  const logoInputRef = useRef<HTMLInputElement>(null);

  /** Read a chosen image file as a base64 data URL and store it on the project. */
  function onLogoFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setProjectMeta({ logoDataUrl: reader.result });
    };
    reader.onerror = () =>
      notifications.show({ message: t('settings.logoReadError'), color: 'red' });
    reader.readAsDataURL(file);
  }

  const system = useMemo(() => computeSystem(project), [project]);
  const standardsVersion = Object.values(system.panels)[0]?.standardsVersion ?? 'unknown';
  const earthing = system.earthing;

  const [version, setVersion] = useState('…');
  const [checking, setChecking] = useState(false);
  const [license, setLicense] = useState<LicenseStatusResult | null>(null);
  useEffect(() => {
    void appVersion().then(setVersion);
    if (isDesktop()) void licenseStatus().then(setLicense);
  }, []);

  async function onSignOut() {
    await licenseSignOut();
    setLicense(await licenseStatus());
    notifications.show({ message: t('settings.licenseSignedOut'), color: 'gray' });
  }

  async function onCheckUpdates() {
    setChecking(true);
    const status = await checkForUpdates();
    setChecking(false);
    const message =
      status.state === 'available'
        ? t('settings.updateAvailable', { version: status.version })
        : status.state === 'not-available'
          ? t('settings.updateLatest')
          : status.state === 'disabled'
            ? status.reason
            : status.state === 'error'
              ? t('settings.updateCheckFailed', { message: status.message })
              : t('settings.updateChecking');
    notifications.show({ message, color: status.state === 'available' ? 'indigo' : 'gray' });
  }

  if (!panel) {
    return (
      <Alert color="yellow" title={t('settings.noPanelTitle')}>
        {t('settings.noPanelBody')}
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {t('settings.eyebrow')}
        </Text>
        <Title order={3}>{t('settings.panelDefaults', { name: panel.name })}</Title>
      </div>

      <Card withBorder radius="md" padding="md">
        <Group gap="xs" mb="md">
          <IconBuildingFactory2 size={18} color="var(--mantine-color-indigo-6)" />
          <Text fw={600}>{t('settings.projectDetails')}</Text>
        </Group>
        <Text size="xs" c="dimmed" mb="md">
          {t('settings.projectDetailsHint')}
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput
            label={t('settings.companyName')}
            placeholder={t('settings.companyNamePlaceholder')}
            value={meta.companyName ?? ''}
            onChange={(e) => setProjectMeta({ companyName: e.currentTarget.value })}
          />
          <TextInput
            label={t('settings.client')}
            placeholder={t('settings.clientPlaceholder')}
            value={meta.client ?? ''}
            onChange={(e) => setProjectMeta({ client: e.currentTarget.value })}
          />
          <TextInput
            label={t('settings.location')}
            placeholder={t('settings.locationPlaceholder')}
            value={meta.location ?? ''}
            onChange={(e) => setProjectMeta({ location: e.currentTarget.value })}
          />
          <TextInput
            label={t('settings.engineer')}
            placeholder={t('settings.engineerPlaceholder')}
            value={meta.engineer ?? ''}
            onChange={(e) => setProjectMeta({ engineer: e.currentTarget.value })}
          />
          <TextInput
            label={t('settings.drawingNumber')}
            placeholder={t('settings.drawingNumberPlaceholder')}
            value={meta.drawingNumber ?? ''}
            onChange={(e) => setProjectMeta({ drawingNumber: e.currentTarget.value })}
          />
          <TextInput
            label={t('settings.projectNumber')}
            placeholder={t('settings.projectNumberPlaceholder')}
            value={meta.projectNumber ?? ''}
            onChange={(e) => setProjectMeta({ projectNumber: e.currentTarget.value })}
          />
          <TextInput
            label={t('settings.revision')}
            placeholder={t('settings.revisionPlaceholder')}
            value={meta.revision ?? ''}
            onChange={(e) => setProjectMeta({ revision: e.currentTarget.value })}
            maw={160}
          />
        </SimpleGrid>

        <Group align="flex-end" mt="md" gap="md">
          <div>
            <Text size="sm" fw={500} mb={4}>
              {t('settings.companyLogo')}
            </Text>
            {meta.logoDataUrl ? (
              <Group gap="sm" align="center">
                <Image
                  src={meta.logoDataUrl}
                  alt={t('settings.companyLogoAlt')}
                  h={48}
                  w="auto"
                  fit="contain"
                  style={{ maxWidth: 160, border: '1px solid var(--mantine-color-gray-3)' }}
                />
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  leftSection={<IconX size={14} />}
                  onClick={() => setProjectMeta({ logoDataUrl: undefined })}
                >
                  {t('common.clear')}
                </Button>
              </Group>
            ) : (
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPhoto size={14} />}
                onClick={() => logoInputRef.current?.click()}
              >
                {t('settings.uploadLogo')}
              </Button>
            )}
            {/* Hidden native file picker; reads the chosen image as a data URL. */}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              style={{ display: 'none' }}
              onChange={(e) => {
                onLogoFile(e.currentTarget.files?.[0] ?? null);
                // Reset so re-selecting the same file fires change again.
                e.currentTarget.value = '';
              }}
            />
          </div>
        </Group>
      </Card>

      <Card withBorder radius="md" padding="md">
        <Text fw={600} mb="md">
          {t('settings.environment')}
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <NumberInput
            label={t('settings.ambientTemp')}
            description={t('settings.ambientTempHint')}
            suffix=" °C"
            min={10}
            max={70}
            value={panel.ambientTempC}
            onChange={(v) =>
              typeof v === 'number' && updatePanel(panel.id, { ambientTempC: v })
            }
          />
          <NumberInput
            label={t('settings.groupingCount')}
            description={t('settings.groupingCountHint')}
            min={1}
            max={20}
            value={panel.groupingCount}
            onChange={(v) =>
              typeof v === 'number' && updatePanel(panel.id, { groupingCount: v })
            }
          />
          <Select
            label={t('settings.installMethod')}
            data={INSTALL_METHOD_VALUES.map((value) => ({
              value,
              label: t(`installMethod.${value}`),
            }))}
            value={panel.installMethod}
            allowDeselect={false}
            onChange={(v) => v && updatePanel(panel.id, { installMethod: v as InstallMethod })}
          />
          <NumberInput
            label={t('settings.diversityFactor')}
            description={t('settings.diversityFactorHint')}
            min={0.1}
            max={1}
            step={0.05}
            decimalScale={2}
            value={panel.diversityFactor}
            onChange={(v) =>
              typeof v === 'number' && updatePanel(panel.id, { diversityFactor: v })
            }
          />
        </SimpleGrid>
      </Card>

      <Card withBorder radius="md" padding="md">
        <Group gap="xs" mb="md">
          <IconShieldBolt size={18} color="var(--mantine-color-teal-6)" />
          <Text fw={600}>{t('settings.earthing')}</Text>
        </Group>
        <Select
          label={t('settings.earthingSystem')}
          description={t('settings.earthingSystemHint')}
          data={EARTHING_SYSTEMS.map((e) => ({ value: e.value, label: e.label }))}
          value={project.earthingSystem ?? 'TN-C-S'}
          allowDeselect={false}
          onChange={(v) => v && setEarthingSystem(v as EarthingSystem)}
          mb="md"
          maw={360}
        />
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="xs">
          <KeyStat
            k={t('settings.rcdPolicy')}
            v={earthing.requiresRcd ? t('settings.rcdAll') : t('settings.rcdSockets')}
          />
          <KeyStat k={t('settings.mainEarthing')} v={`${earthing.mainEarthingConductorMm2} mm²`} />
          <KeyStat k={t('settings.mainBonding')} v={`${earthing.mainBondingConductorMm2} mm²`} />
          <KeyStat
            k={t('settings.electrodeTarget')}
            v={`≤ ${earthing.electrodeResistanceTargetOhm} Ω`}
          />
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          {earthing.note}
        </Text>
      </Card>

      {isDesktop() && license && (
        <Card withBorder radius="md" padding="md">
          <Group gap="xs" mb="md">
            <IconLock size={18} color="var(--mantine-color-indigo-6)" />
            <Text fw={600}>{t('settings.licensing')}</Text>
          </Group>
          {license.enforced ? (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {t('settings.licenseStatus')}
                </Text>
                <Text size="sm" fw={500} c={license.licensed ? 'teal' : 'red'}>
                  {license.licensed ? t('settings.licenseLicensed') : t('settings.licenseLocked')}
                </Text>
              </Group>
              {license.email && (
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    {t('settings.licenseSignedInAs')}
                  </Text>
                  <Text size="sm" fw={500}>
                    {license.email}
                  </Text>
                </Group>
              )}
              {license.lastVerifiedAtMs && (
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    {t('settings.licenseLastVerified')}
                  </Text>
                  <Text size="sm" fw={500}>
                    {new Date(license.lastVerifiedAtMs).toLocaleString()}
                  </Text>
                </Group>
              )}
              <Group justify="flex-end">
                <Button size="xs" variant="light" color="red" onClick={onSignOut}>
                  {t('settings.licenseSignOut')}
                </Button>
              </Group>
            </SimpleGrid>
          ) : (
            <Text size="sm" c="dimmed">
              {t('settings.licenseNotEnforced')}
            </Text>
          )}
        </Card>
      )}

      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" mb="md">
          <Text fw={600}>{t('settings.application')}</Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconRefresh size={14} />}
            loading={checking}
            onClick={onCheckUpdates}
          >
            {t('settings.checkUpdates')}
          </Button>
        </Group>
        <Select
          label={t('settings.language')}
          description={t('settings.languageHint')}
          data={LANGUAGES}
          value={getLanguage()}
          allowDeselect={false}
          onChange={(v) => v && setLanguage(v as Language)}
          mb="md"
          maw={360}
        />
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {t('settings.version')}
            </Text>
            <Text size="sm" fw={500} ff="monospace">
              {version}
            </Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {t('settings.currency')}
            </Text>
            <Text size="sm" fw={500}>
              IDR
            </Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {t('settings.standards')}
            </Text>
            <Text size="sm" fw={500} ff="monospace">
              {standardsVersion}
            </Text>
          </Group>
        </SimpleGrid>
        <Text size="xs" c="dimmed" mt="xs">
          {t('settings.autoUpdateNote')}
        </Text>
      </Card>

      <Alert variant="light" color="blue" icon={<IconInfoCircle size={18} />}>
        {t('settings.recomputeNote')}
      </Alert>
    </Stack>
  );
}

/** Compact key/value for the earthing design strip. */
function KeyStat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {k}
      </Text>
      <Text size="sm" fw={600}>
        {v}
      </Text>
    </div>
  );
}
