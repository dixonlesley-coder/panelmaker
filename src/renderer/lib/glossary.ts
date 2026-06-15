/**
 * Plain-language glossary for non-expert users.
 *
 * Every entry pairs the technical `term` (as it appears on screen) with a single
 * friendly sentence anyone can understand. `plain` is English; `plainId` is the
 * Bahasa Indonesia translation. The glossary is deliberately a plain TypeScript
 * record (no i18n keys, no runtime fetch) so it can be imported anywhere in the
 * renderer — including the `<JargonTip>` tooltip — without touching the locale
 * bundles.
 *
 * Keep the explanations short, warm and jargon-free: they exist so that someone
 * who is NOT an electrical engineer still understands what a figure on the
 * circuit editor or a "why these sizes" note actually means.
 */

/** One glossary item: the term plus a plain-language explanation per language. */
export interface GlossaryEntry {
  /** The technical term exactly as a user sees it (e.g. "Earth-fault loop (Zs)"). */
  term: string;
  /** One friendly sentence in plain English a non-engineer understands. */
  plain: string;
  /** The same explanation in Bahasa Indonesia (optional). */
  plainId?: string;
}

/**
 * The glossary, keyed by a short stable id. Ids are what callers pass to
 * `<JargonTip id="...">` / `<GlossaryInfo id="..."/>`, so they should stay
 * stable. Several common aliases (e.g. `ka` ↔ `icu`, `kha` ↔ `iz`) point at the
 * same concept so a caller can use whichever label the screen shows.
 */
export const GLOSSARY: Readonly<Record<string, GlossaryEntry>> = {
  zs: {
    term: 'Earth-fault loop impedance (Zs)',
    plain:
      'How easily an earth fault can flow back to the source — lower is better, because the breaker then trips faster.',
    plainId:
      'Seberapa mudah arus gangguan ke bumi bisa kembali ke sumber — makin kecil makin baik, karena pemutus akan trip lebih cepat.',
  },
  icu: {
    term: 'Breaking capacity (Icu / kA)',
    plain: 'The biggest short-circuit current the breaker can safely interrupt without being destroyed.',
    plainId: 'Arus hubung-singkat terbesar yang masih bisa diputus dengan aman oleh pemutus tanpa rusak.',
  },
  ka: {
    term: 'Breaking capacity (kA)',
    plain: 'The biggest short-circuit current the breaker can safely interrupt without being destroyed.',
    plainId: 'Arus hubung-singkat terbesar yang masih bisa diputus dengan aman oleh pemutus tanpa rusak.',
  },
  iz: {
    term: 'Cable ampacity (Iz)',
    plain: 'How much current the cable can carry continuously without overheating.',
    plainId: 'Berapa besar arus yang bisa dialirkan kabel terus-menerus tanpa menjadi terlalu panas.',
  },
  kha: {
    term: 'Cable ampacity (KHA)',
    plain: 'How much current the cable can carry continuously without overheating.',
    plainId: 'Berapa besar arus yang bisa dialirkan kabel terus-menerus tanpa menjadi terlalu panas.',
  },
  ib: {
    term: 'Design current (Ib)',
    plain: 'The normal running current the load actually draws.',
    plainId: 'Arus kerja normal yang benar-benar ditarik oleh beban.',
  },
  in: {
    term: 'Breaker rating (In)',
    plain: 'The current the breaker is set to allow before it trips — chosen above the load but below the cable limit.',
    plainId:
      'Arus yang diizinkan pemutus sebelum trip — dipilih di atas beban tetapi di bawah batas kabel.',
  },
  vd: {
    term: 'Voltage drop (ΔU)',
    plain: 'How much voltage is lost along the cable before it reaches the load; too much makes equipment run poorly.',
    plainId:
      'Berapa banyak tegangan yang hilang di sepanjang kabel sebelum sampai ke beban; jika berlebihan, peralatan bekerja kurang baik.',
  },
  deltaU: {
    term: 'Voltage drop (ΔU)',
    plain: 'How much voltage is lost along the cable before it reaches the load; too much makes equipment run poorly.',
    plainId:
      'Berapa banyak tegangan yang hilang di sepanjang kabel sebelum sampai ke beban; jika berlebihan, peralatan bekerja kurang baik.',
  },
  ads: {
    term: 'Automatic disconnection of supply (ADS)',
    plain: 'The safety rule that the breaker must cut the power fast enough during an earth fault to keep people safe.',
    plainId:
      'Aturan keselamatan: pemutus harus memutus listrik cukup cepat saat terjadi gangguan ke bumi agar orang tetap aman.',
  },
  rcd: {
    term: 'Residual-current device (RCD)',
    plain: 'A protective switch that trips on tiny earth-leakage currents to protect people from electric shock.',
    plainId: 'Sakelar pengaman yang trip pada arus bocor kecil ke bumi untuk melindungi orang dari sengatan listrik.',
  },
  rcdType: {
    term: 'RCD type (AC / A / B)',
    plain:
      'Which kinds of leakage current the RCD can detect — type A also catches pulsing DC, type B even smooth DC from drives.',
    plainId:
      'Jenis arus bocor yang dapat dideteksi RCD — tipe A juga menangkap DC berdenyut, tipe B bahkan DC rata dari inverter.',
  },
  pf: {
    term: 'Power factor (cos φ)',
    plain: 'How efficiently the load turns supplied power into useful work; a low value means you pay for wasted capacity.',
    plainId:
      'Seberapa efisien beban mengubah daya yang dipasok menjadi kerja berguna; nilai rendah berarti membayar kapasitas yang terbuang.',
  },
  cosphi: {
    term: 'Power factor (cos φ)',
    plain: 'How efficiently the load turns supplied power into useful work; a low value means you pay for wasted capacity.',
    plainId:
      'Seberapa efisien beban mengubah daya yang dipasok menjadi kerja berguna; nilai rendah berarti membayar kapasitas yang terbuang.',
  },
  demandFactor: {
    term: 'Demand factor',
    plain: 'The fraction of a load that is actually on at the same time — rarely is everything running at once.',
    plainId:
      'Bagian dari beban yang benar-benar menyala bersamaan — jarang semuanya bekerja serentak.',
  },
  diversity: {
    term: 'Diversity',
    plain: 'Because not all circuits peak together, the total feeder size can be smaller than adding every load up.',
    plainId:
      'Karena tidak semua rangkaian memuncak bersamaan, ukuran pengumpan total bisa lebih kecil daripada menjumlahkan semua beban.',
  },
  derating: {
    term: 'Derating',
    plain: 'Reducing a cable’s allowed current when heat, grouping or burial make it harder to shed heat.',
    plainId:
      'Mengurangi arus izin kabel ketika panas, pengelompokan, atau penanaman membuat kabel lebih sulit membuang panas.',
  },
  daya: {
    term: 'Connected power (daya tersambung)',
    plain: 'The amount of power you have contracted from PLN; your total demand must stay within it.',
    plainId: 'Besarnya daya yang Anda kontrak dari PLN; total kebutuhan harus tetap di bawahnya.',
  },
  frc: {
    term: 'Fire-resistant cable (FRC)',
    plain: 'A special cable that keeps working during a fire, used for things like fire pumps and alarms.',
    plainId: 'Kabel khusus yang tetap berfungsi saat kebakaran, dipakai untuk pompa kebakaran dan alarm.',
  },
  busbar: {
    term: 'Busbar',
    plain: 'The thick copper bars inside the panel that distribute power to all the breakers.',
    plainId: 'Batang tembaga tebal di dalam panel yang membagikan daya ke semua pemutus.',
  },
  minFault: {
    term: 'Minimum fault current',
    plain: 'The smallest short-circuit current expected — the breaker must still trip on it, or a fault could smoulder.',
    plainId:
      'Arus hubung-singkat terkecil yang diperkirakan — pemutus tetap harus trip padanya, jika tidak gangguan bisa membara.',
  },
  inrush: {
    term: 'Inrush current',
    plain: 'The brief surge of current when a motor or transformer first switches on, much larger than its normal draw.',
    plainId:
      'Lonjakan arus singkat saat motor atau trafo pertama kali dinyalakan, jauh lebih besar dari arus normalnya.',
  },
};

/** Look up a glossary entry by id; returns `undefined` for an unknown id. */
export function glossaryLookup(id: string): GlossaryEntry | undefined {
  return GLOSSARY[id];
}
