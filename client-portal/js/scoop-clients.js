/**
 * Scoop client roster — scraped from https://scoop.qa/clients/ (Aug 2026).
 * Self-contained, same isolation reasoning as the rest of client-portal/
 * (see portal.css's file header) — no import from assets/js/.
 *
 * Logos are self-hosted under client-portal/images/clients/<slug>.png (see
 * download-logos.sh in this folder) rather than hotlinked from scoop.qa's WP
 * media library, which gets renamed/regenerated and would break the links.
 * `w`/`h` are each PNG's real intrinsic pixel size, read once from the
 * downloaded files — consumers use them as <img width/height> attributes so
 * the browser can reserve the correct aspect ratio before the (lazy-loaded)
 * image decodes, even though CSS then scales the rendered size down to a
 * fixed tile height.
 */

const LOGO_BASE = 'images/clients';

export const CLIENT_CATEGORIES = [
  'Banking & Finance',
  'Insurance',
  'Telecom',
  'Real Estate & Development',
  'Government & Culture',
  'Retail & Malls',
  'F&B',
  'Delivery',
  'Sports & Events',
  'Automotive',
  'Hospitality & Leisure',
  'Education',
  'Other',
];

const CLIENT_DATA = [
  // Banking & Finance
  { name: 'QNB',                        slug: 'qnb',                 category: 'Banking & Finance',        w: 500, h: 300 },
  { name: 'Commercial Bank of Qatar',   slug: 'cbq',                 category: 'Banking & Finance',        w: 500, h: 300 },
  { name: 'Doha Bank',                  slug: 'doha-bank',           category: 'Banking & Finance',        w: 500, h: 300 },
  { name: 'Dukhan Bank',                slug: 'dukhan-bank',         category: 'Banking & Finance',        w: 500, h: 300 },
  { name: 'Al Rayyan Bank',             slug: 'al-rayyan-bank',      category: 'Banking & Finance',        w: 500, h: 300 },
  { name: 'Ahlibank',                   slug: 'ahlibank',            category: 'Banking & Finance',        w: 500, h: 300 },
  { name: 'Mastercard',                 slug: 'mastercard',          category: 'Banking & Finance',        w: 500, h: 300 },

  // Insurance
  { name: 'QIC',                        slug: 'qic',                 category: 'Insurance',                w: 500, h: 300 },
  { name: 'Beema',                      slug: 'beema',               category: 'Insurance',                w: 500, h: 300 },
  { name: 'Daman',                      slug: 'daman',               category: 'Insurance',                w: 500, h: 300 },

  // Telecom
  { name: 'Ooredoo',                    slug: 'ooredoo',             category: 'Telecom',                  w: 500, h: 300 },
  { name: 'Vodafone',                   slug: 'vodafone',            category: 'Telecom',                  w: 500, h: 300 },

  // Real Estate & Development
  { name: 'United Development Company', slug: 'udc',                 category: 'Real Estate & Development', w: 500, h: 300 },
  { name: 'The Pearl Island',           slug: 'the-pearl-island',    category: 'Real Estate & Development', w: 500, h: 300 },
  { name: 'Gewan Island',               slug: 'gewan-island',        category: 'Real Estate & Development', w: 500, h: 300 },
  { name: 'Qatari Diar',                slug: 'qatari-diar',         category: 'Real Estate & Development', w: 500, h: 300 },
  { name: 'Hospitality Development Co.', slug: 'hdc',                category: 'Real Estate & Development', w: 500, h: 300 },
  { name: 'Betterhomes',                slug: 'betterhomes',         category: 'Real Estate & Development', w: 500, h: 300 },
  { name: 'Capstone',                   slug: 'capstone',            category: 'Real Estate & Development', w: 500, h: 300 },
  { name: 'Coreo',                      slug: 'coreo',               category: 'Real Estate & Development', w: 500, h: 300 },

  // Government & Culture
  { name: 'QatarEnergy',                slug: 'qatarenergy',         category: 'Government & Culture',     w: 500, h: 300 },
  { name: 'Qatar Airways',              slug: 'qatar-airways',       category: 'Government & Culture',     w: 500, h: 300 },
  { name: 'Qatar Museums',              slug: 'qatar-museums',       category: 'Government & Culture',     w: 500, h: 300 },
  { name: 'Visit Qatar',                slug: 'visit-qatar',         category: 'Government & Culture',     w: 500, h: 300 },
  { name: 'Qatar Charity',              slug: 'qatar-charity',       category: 'Government & Culture',     w: 500, h: 300 },
  { name: 'Al Shaqab',                  slug: 'al-shaqab',           category: 'Government & Culture',     w: 500, h: 300 },
  { name: 'Sidra Medicine',             slug: 'sidra',               category: 'Government & Culture',     w: 500, h: 300 },
  { name: 'ExxonMobil',                 slug: 'exxonmobil',          category: 'Government & Culture',     w: 500, h: 300 },

  // Retail & Malls
  { name: 'Mall of Qatar',              slug: 'mall-of-qatar',       category: 'Retail & Malls',           w: 500, h: 300 },
  { name: 'Doha Festival City',         slug: 'dfc',                 category: 'Retail & Malls',           w: 500, h: 300 },
  { name: 'Place Vendôme',              slug: 'place-vendome',       category: 'Retail & Malls',           w: 500, h: 300 },
  { name: 'Landmark',                   slug: 'landmark',            category: 'Retail & Malls',           w: 500, h: 300 },
  { name: 'Monoprix',                   slug: 'monoprix',            category: 'Retail & Malls',           w: 500, h: 300 },
  { name: 'Carrefour',                  slug: 'carrefour',           category: 'Retail & Malls',           w: 500, h: 300 },
  { name: '51 East',                    slug: '51-east',             category: 'Retail & Malls',           w: 500, h: 300 },
  { name: 'IKEA',                       slug: 'ikea',                category: 'Retail & Malls',           w: 500, h: 300 },
  { name: 'Sports Corner',              slug: 'sports-corner',       category: 'Retail & Malls',           w: 500, h: 300 },
  { name: 'David Yurman',               slug: 'david-yurman',        category: 'Retail & Malls',           w: 500, h: 300 },
  { name: 'Alfardan Jewellery',         slug: 'alfardan-jewellery',  category: 'Retail & Malls',           w: 500, h: 300 },
  { name: 'Boucheron',                  slug: 'boucheron',           category: 'Retail & Malls',           w: 500, h: 300 },
  { name: 'Tudor',                      slug: 'tudor',               category: 'Retail & Malls',           w: 500, h: 300 },

  // F&B
  { name: 'KFC',                        slug: 'kfc',                 category: 'F&B',                      w: 500, h: 300 },
  { name: "Nando's",                    slug: 'nandos',              category: 'F&B',                      w: 500, h: 300 },
  { name: 'Texas Chicken',              slug: 'texas-chicken',       category: 'F&B',                      w: 500, h: 300 },
  { name: 'Rayyan',                     slug: 'rayyan',              category: 'F&B',                      w: 500, h: 300 },

  // Delivery
  { name: 'Talabat',                    slug: 'talabat',             category: 'Delivery',                 w: 500, h: 300 },
  { name: 'Snoonu',                     slug: 'snoonu',              category: 'Delivery',                 w: 350, h: 205 },
  { name: 'Rafeeq',                     slug: 'rafeeq',              category: 'Delivery',                 w: 350, h: 205 },
  { name: 'Deliveroo',                  slug: 'deliveroo',           category: 'Delivery',                 w: 350, h: 205 },
  { name: 'Keeta',                      slug: 'keeta',               category: 'Delivery',                 w: 500, h: 300 },

  // Sports & Events
  { name: 'Formula 1',                  slug: 'f1',                  category: 'Sports & Events',          w: 500, h: 300 },
  { name: 'FIBA',                       slug: 'fiba',                category: 'Sports & Events',          w: 500, h: 300 },
  { name: 'Global Championship',        slug: 'global-championship', category: 'Sports & Events',          w: 500, h: 300 },
  { name: 'WEC',                        slug: 'wec',                 category: 'Sports & Events',          w: 500, h: 300 },
  { name: 'ATP',                        slug: 'atp',                 category: 'Sports & Events',          w: 500, h: 300 },
  { name: 'WTA',                        slug: 'wta',                 category: 'Sports & Events',          w: 500, h: 300 },
  { name: 'UFC Gym',                    slug: 'ufc-gym',             category: 'Sports & Events',          w: 500, h: 300 },
  { name: 'Winter Wonderland',          slug: 'winter-wonderland',   category: 'Sports & Events',          w: 500, h: 300 },
  { name: 'Ajyal',                      slug: 'ajyal',               category: 'Sports & Events',          w: 500, h: 300 },

  // Automotive
  { name: 'Abdullah Abdulghani & Bros', slug: 'abdullah-abdulghani', category: 'Automotive',               w: 500, h: 300 },
  { name: 'Mercedes-Benz',              slug: 'mercedes-benz',       category: 'Automotive',               w: 500, h: 300 },
  { name: 'Jetur',                      slug: 'jetur',               category: 'Automotive',               w: 500, h: 300 },

  // Hospitality & Leisure
  { name: 'Corinthia',                  slug: 'corinthia',           category: 'Hospitality & Leisure',    w: 500, h: 300 },
  { name: 'Ronautica',                  slug: 'ronautica',           category: 'Hospitality & Leisure',    w: 500, h: 300 },
  { name: 'Meryal Waterpark',           slug: 'meryal',              category: 'Hospitality & Leisure',    w: 500, h: 300 },
  { name: 'Aura Group',                 slug: 'aura-group',          category: 'Hospitality & Leisure',    w: 500, h: 300 },

  // Education
  { name: 'Georgetown University Qatar', slug: 'georgetown',         category: 'Education',                w: 500, h: 300 },

  // Other
  { name: 'KMC',                        slug: 'kmc',                 category: 'Other',                    w: 500, h: 300 },
];

export const CLIENTS = CLIENT_DATA.map(c => ({ ...c, logo: `${LOGO_BASE}/${c.slug}.png` }));
