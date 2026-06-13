/**
 * The "Commercial" hub — one destination tabbing over the parts catalog, the
 * imported pricelist, and the quotation/proposal, so the sidebar stays short.
 * The active tab tracks `activeScreen` (see {@link ReviewHub} for the pattern).
 */

import { useTranslation } from 'react-i18next';
import { Tabs } from '@mantine/core';
import { IconBox, IconReceipt, IconReceipt2 } from '@tabler/icons-react';
import { useProjectStore, type Screen } from '@renderer/state/projectStore';
import { PartsCatalog } from '@renderer/screens/PartsCatalog';
import { Pricelist } from '@renderer/screens/Pricelist';
import { Quotation } from '@renderer/screens/Quotation';

/** Sub-screens that live under the Commercial hub, in tab order. */
export const COMMERCIAL_SCREENS: Screen[] = ['parts', 'pricelist', 'quotation'];

export function CommercialHub() {
  const { t } = useTranslation();
  const activeScreen = useProjectStore((s) => s.activeScreen);
  const setScreen = useProjectStore((s) => s.setScreen);
  const value = COMMERCIAL_SCREENS.includes(activeScreen) ? activeScreen : 'parts';

  return (
    <Tabs value={value} onChange={(v) => v && setScreen(v as Screen)} keepMounted={false}>
      <Tabs.List mb="md">
        <Tabs.Tab value="parts" leftSection={<IconBox size={15} />}>
          {t('nav.parts')}
        </Tabs.Tab>
        <Tabs.Tab value="pricelist" leftSection={<IconReceipt size={15} />}>
          {t('nav.pricelist')}
        </Tabs.Tab>
        <Tabs.Tab value="quotation" leftSection={<IconReceipt2 size={15} />}>
          {t('nav.quotation')}
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="parts"><PartsCatalog /></Tabs.Panel>
      <Tabs.Panel value="pricelist"><Pricelist /></Tabs.Panel>
      <Tabs.Panel value="quotation"><Quotation /></Tabs.Panel>
    </Tabs>
  );
}
