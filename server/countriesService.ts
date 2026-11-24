/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountryDetails,
  CountrySuggestion,
  ParentStateInfo,
  RelatedTerritoryLink,
  TerritoryKind,
} from '../src/types/country.ts';

interface RawCountryNameEntry {
  common?: string;
  official?: string;
}

interface RawRestCountry {
  cca2?: string;
  cca3?: string;
  independent?: boolean;
  name?: {
    common?: string;
    official?: string;
    nativeName?: Record<string, RawCountryNameEntry>;
  };
  translations?: Record<string, RawCountryNameEntry>;
  flags?: {
    png?: string;
    svg?: string;
    alt?: string;
  };
  capital?: string[];
  population?: number;
  continents?: string[];
  region?: string;
  subregion?: string;
  languages?: Record<string, string>;
  currencies?: Record<string, { name?: string; symbol?: string }>;
  area?: number;
  idd?: {
    root?: string;
    suffixes?: string[];
  };
  altSpellings?: string[];
}

interface IndexedCountry {
  details: CountryDetails;
  suggestion: CountrySuggestion;
  primarySpanishCommon: string;
  primarySpanishOfficial: string;
  primaryEnglishCommon: string;
  primaryEnglishOfficial: string;
  isoCodes: string[];
  searchableNames: string[];
}

interface SubNationalRegionSpec {
  code: string;
  cca2: string;
  parentCca3: string;
  commonName: string;
  officialName: string;
  englishCommonName: string;
  englishOfficialName: string;
  entityStatusLabel: string;
  capital: string;
  languages: string;
  flagUrl: string;
  flagAlt: string;
  clarificationNote: string;
  aliases: string[];
}

const DEFAULT_REST_COUNTRIES_BASE_URL = 'https://restcountries.com/v3.1';
const OFFICIAL_REST_COUNTRIES_V31_DATASET_URL =
  'https://gitlab.com/restcountries/restcountries/-/raw/master/src/main/resources/countriesV3.1.json';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const REQUEST_TIMEOUT_MS = 10000;

let cachedCountries: IndexedCountry[] | null = null;
let cacheTimestamp = 0;
let inFlightLoad: Promise<IndexedCountry[]> | null = null;

const CONTINENT_TRANSLATIONS: Record<string, string> = {
  Africa: 'África',
  Antarctica: 'Antártida',
  Asia: 'Asia',
  Europe: 'Europa',
  'North America': 'América del Norte',
  Oceania: 'Oceanía',
  'South America': 'América del Sur',
};

const REGION_TRANSLATIONS: Record<string, string> = {
  Africa: 'África',
  Americas: 'Américas',
  Antarctic: 'Antártida',
  Asia: 'Asia',
  Europe: 'Europa',
  Oceania: 'Oceanía',
};

const SUBREGION_TRANSLATIONS: Record<string, string> = {
  'Australia and New Zealand': 'Australia y Nueva Zelanda',
  Caribbean: 'Caribe',
  'Central America': 'América Central',
  'Central Asia': 'Asia Central',
  'Central Europe': 'Europa Central',
  'Eastern Africa': 'África Oriental',
  'Eastern Asia': 'Asia Oriental',
  'Eastern Europe': 'Europa Oriental',
  Melanesia: 'Melanesia',
  Micronesia: 'Micronesia',
  'Middle Africa': 'África Central',
  'North America': 'América del Norte',
  'Northern Africa': 'África del Norte',
  'Northern Europe': 'Europa del Norte',
  Polynesia: 'Polinesia',
  'South America': 'América del Sur',
  'South-Eastern Asia': 'Sudeste Asiático',
  'Southeast Europe': 'Europa del Sudeste',
  'Southern Africa': 'África Austral',
  'Southern Asia': 'Asia Meridional',
  'Southern Europe': 'Europa del Sur',
  'Western Africa': 'África Occidental',
  'Western Asia': 'Asia Occidental',
  'Western Europe': 'Europa Occidental',
};

const LANGUAGE_FALLBACK_TRANSLATIONS: Record<string, string> = {
  glc: 'Gallego',
  cnr: 'Montenegrino',
  nrf: 'Normando',
  jam: 'Patois jamaicano',
  pih: 'Pitcairnés',
  tpi: 'Tok pisin',
  bis: 'Bislama',
  cal: 'Carolinio',
  zdj: 'Comorense',
  pov: 'Criollo de Guinea-Bisáu',
  bwg: 'Chibarwe',
  kck: 'Kalanga',
  khi: 'Joisán',
  ndc: 'Ndau',
  nde: 'Ndebele del norte',
  nbl: 'Ndebele del sur',
  toi: 'Tonga',
  ber: 'Bereber',
  mey: 'Hassanía',
};

/**
 * Parent sovereign state mapping for non-independent territories already present in REST Countries v3.1.
 */
const TERRITORY_PARENT_MAP: Record<string, { parentCca3: string; statusLabel: string }> = {
  ABW: { parentCca3: 'NLD', statusLabel: 'País constituyente del Reino de los Países Bajos' },
  AIA: { parentCca3: 'GBR', statusLabel: 'Territorio británico de ultramar (Reino Unido)' },
  ALA: { parentCca3: 'FIN', statusLabel: 'Región autónoma de Finlandia' },
  ASM: { parentCca3: 'USA', statusLabel: 'Territorio no incorporado de Estados Unidos' },
  ATF: { parentCca3: 'FRA', statusLabel: 'Territorio de ultramar de Francia' },
  BES: { parentCca3: 'NLD', statusLabel: 'Municipios especiales de los Países Bajos' },
  BLM: { parentCca3: 'FRA', statusLabel: 'Colectividad de ultramar de Francia' },
  BMU: { parentCca3: 'GBR', statusLabel: 'Territorio británico de ultramar (Reino Unido)' },
  BVT: { parentCca3: 'NOR', statusLabel: 'Territorio dependiente de Noruega' },
  CCK: { parentCca3: 'AUS', statusLabel: 'Territorio externo de Australia' },
  COK: { parentCca3: 'NZL', statusLabel: 'Estado libre asociado con Nueva Zelanda' },
  CUW: { parentCca3: 'NLD', statusLabel: 'País constituyente del Reino de los Países Bajos' },
  CXR: { parentCca3: 'AUS', statusLabel: 'Territorio externo de Australia' },
  FLK: { parentCca3: 'GBR', statusLabel: 'Territorio británico de ultramar (en disputa con Argentina)' },
  FRO: { parentCca3: 'DNK', statusLabel: 'Territorio autónomo del Reino de Dinamarca' },
  GGY: { parentCca3: 'GBR', statusLabel: 'Dependencia de la Corona británica (Reino Unido)' },
  GIB: { parentCca3: 'GBR', statusLabel: 'Territorio británico de ultramar (Reino Unido)' },
  GLP: { parentCca3: 'FRA', statusLabel: 'Departamento y región de ultramar de Francia' },
  GRL: { parentCca3: 'DNK', statusLabel: 'Territorio autónomo del Reino de Dinamarca' },
  GUF: { parentCca3: 'FRA', statusLabel: 'Departamento y región de ultramar de Francia' },
  GUM: { parentCca3: 'USA', statusLabel: 'Territorio no incorporado de Estados Unidos' },
  HKG: { parentCca3: 'CHN', statusLabel: 'Región administrativa especial de China' },
  HMD: { parentCca3: 'AUS', statusLabel: 'Territorio externo de Australia' },
  IMN: { parentCca3: 'GBR', statusLabel: 'Dependencia de la Corona británica (Reino Unido)' },
  IOT: { parentCca3: 'GBR', statusLabel: 'Territorio británico de ultramar (Reino Unido)' },
  JEY: { parentCca3: 'GBR', statusLabel: 'Dependencia de la Corona británica (Reino Unido)' },
  MAC: { parentCca3: 'CHN', statusLabel: 'Región administrativa especial de China' },
  MAF: { parentCca3: 'FRA', statusLabel: 'Colectividad de ultramar de Francia' },
  MNP: { parentCca3: 'USA', statusLabel: 'Estado libre asociado a Estados Unidos' },
  MSR: { parentCca3: 'GBR', statusLabel: 'Territorio británico de ultramar (Reino Unido)' },
  MTQ: { parentCca3: 'FRA', statusLabel: 'Departamento y región de ultramar de Francia' },
  MYT: { parentCca3: 'FRA', statusLabel: 'Departamento y región de ultramar de Francia' },
  NCL: { parentCca3: 'FRA', statusLabel: 'Colectividad sui generis de Francia' },
  NFK: { parentCca3: 'AUS', statusLabel: 'Territorio externo de Australia' },
  NIU: { parentCca3: 'NZL', statusLabel: 'Estado libre asociado con Nueva Zelanda' },
  PCN: { parentCca3: 'GBR', statusLabel: 'Territorio británico de ultramar (Reino Unido)' },
  PRI: { parentCca3: 'USA', statusLabel: 'Estado libre asociado a Estados Unidos' },
  PYF: { parentCca3: 'FRA', statusLabel: 'Colectividad de ultramar de Francia' },
  REU: { parentCca3: 'FRA', statusLabel: 'Departamento y región de ultramar de Francia' },
  SGS: { parentCca3: 'GBR', statusLabel: 'Territorio británico de ultramar (Reino Unido)' },
  SHN: { parentCca3: 'GBR', statusLabel: 'Territorio británico de ultramar (Reino Unido)' },
  SJM: { parentCca3: 'NOR', statusLabel: 'Territorio ártico bajo soberanía de Noruega' },
  SPM: { parentCca3: 'FRA', statusLabel: 'Colectividad de ultramar de Francia' },
  SXM: { parentCca3: 'NLD', statusLabel: 'País constituyente del Reino de los Países Bajos' },
  TCA: { parentCca3: 'GBR', statusLabel: 'Territorio británico de ultramar (Reino Unido)' },
  TKL: { parentCca3: 'NZL', statusLabel: 'Territorio dependiente de Nueva Zelanda' },
  UMI: { parentCca3: 'USA', statusLabel: 'Islas ultramarinas menores de Estados Unidos' },
  VGB: { parentCca3: 'GBR', statusLabel: 'Territorio británico de ultramar (Reino Unido)' },
  VIR: { parentCca3: 'USA', statusLabel: 'Territorio no incorporado de Estados Unidos' },
  WLF: { parentCca3: 'FRA', statusLabel: 'Colectividad de ultramar de Francia' },
  CYM: { parentCca3: 'GBR', statusLabel: 'Territorio británico de ultramar (Reino Unido)' },
};

/**
 * Additional Spanish common spellings / alternative names for existing REST Countries entries
 * (without conflating sub-national regions like Inglaterra with the sovereign state).
 */
const COUNTRY_SPANISH_ALIASES: Record<string, string[]> = {
  USA: ['EEUU', 'EE. UU.', 'EE.UU.', 'Estados Unidos de Norteamérica'],
  CZE: ['República Checa'],
  MMR: ['Birmania'],
  CIV: ['Costa de Marfil'],
  SWZ: ['Suazilandia', 'Esuatini'],
  TUR: ['Turquía', 'Türkiye'],
  CPV: ['Cabo Verde'],
  MKD: ['Macedonia del Norte', 'Macedonia'],
  BIH: ['Bosnia y Herzegovina', 'Bosnia'],
  FRO: ['Islas Feroe'],
  ALA: ['Islas Åland', 'Islas Aland', 'Åland'],
  TCA: ['Islas Turcas y Caicos'],
  CUW: ['Curazao', 'Curaçao'],
  SXM: ['San Martín'],
  MAF: ['San Martín'],
  FLK: ['Islas Malvinas', 'Falkland Islands'],
};

/**
 * Constituent countries, autonomous regions, and geographic territories that depend on
 * another sovereign state and are NOT listed as separate records in REST Countries v3.1.
 * Statistical fields not provided independently by REST Countries (population, area) are
 * explicitly marked as unavailable rather than invented or copied as identical to the parent state.
 */
const CONSTITUENT_TERRITORIES: SubNationalRegionSpec[] = [
  {
    code: 'GB-ENG',
    cca2: 'GB-ENG',
    parentCca3: 'GBR',
    commonName: 'Inglaterra',
    officialName: 'Inglaterra (nación constitutiva del Reino Unido)',
    englishCommonName: 'England',
    englishOfficialName: 'England',
    entityStatusLabel: 'Nación constitutiva del Reino Unido',
    capital: 'Londres',
    languages: 'Inglés',
    flagUrl: 'https://flagcdn.com/gb-eng.svg',
    flagAlt: 'Bandera de Inglaterra (Cruz de San Jorge)',
    clarificationNote:
      'Inglaterra forma parte del Reino Unido de Gran Bretaña e Irlanda del Norte y no es un Estado soberano independiente ni equivale a todo el Reino Unido. La moneda y el código telefónico mostrados corresponden al Reino Unido en REST Countries.',
    aliases: ['Inglaterra', 'England'],
  },
  {
    code: 'GB-SCT',
    cca2: 'GB-SCT',
    parentCca3: 'GBR',
    commonName: 'Escocia',
    officialName: 'Escocia (nación constitutiva del Reino Unido)',
    englishCommonName: 'Scotland',
    englishOfficialName: 'Scotland',
    entityStatusLabel: 'Nación constitutiva del Reino Unido',
    capital: 'Edimburgo',
    languages: 'Inglés, Gaélico escocés, Escocés',
    flagUrl: 'https://flagcdn.com/gb-sct.svg',
    flagAlt: 'Bandera de Escocia (Cruz de San Andrés)',
    clarificationNote:
      'Escocia es una nación constitutiva que forma parte del Reino Unido y no un Estado independiente en REST Countries. La moneda y el código telefónico provienen del registro oficial del Reino Unido.',
    aliases: ['Escocia', 'Scotland'],
  },
  {
    code: 'GB-WLS',
    cca2: 'GB-WLS',
    parentCca3: 'GBR',
    commonName: 'Gales',
    officialName: 'Gales (nación constitutiva del Reino Unido)',
    englishCommonName: 'Wales',
    englishOfficialName: 'Wales',
    entityStatusLabel: 'Nación constitutiva del Reino Unido',
    capital: 'Cardiff',
    languages: 'Inglés, Galés',
    flagUrl: 'https://flagcdn.com/gb-wls.svg',
    flagAlt: 'Bandera de Gales (El Dragón Rojo)',
    clarificationNote:
      'Gales es una nación constitutiva que forma parte del Reino Unido y no un Estado independiente en REST Countries. La moneda y el código telefónico provienen del registro oficial del Reino Unido.',
    aliases: ['Gales', 'Wales', 'Cymru'],
  },
  {
    code: 'GB-NIR',
    cca2: 'GB-NIR',
    parentCca3: 'GBR',
    commonName: 'Irlanda del Norte',
    officialName: 'Irlanda del Norte (nación constitutiva del Reino Unido)',
    englishCommonName: 'Northern Ireland',
    englishOfficialName: 'Northern Ireland',
    entityStatusLabel: 'Nación constitutiva del Reino Unido',
    capital: 'Belfast',
    languages: 'Inglés, Irlandés, Escocés del Úlster',
    flagUrl: 'https://flagcdn.com/gb-nir.svg',
    flagAlt: 'Estandarte histórico de Irlanda del Norte',
    clarificationNote:
      'Irlanda del Norte forma parte del Reino Unido (no pertenece a la República de Irlanda ni es un Estado independiente). La moneda y el código telefónico corresponden al Reino Unido en REST Countries.',
    aliases: ['Irlanda del Norte', 'Northern Ireland'],
  },
  {
    code: 'GB-GBR',
    cca2: 'GB',
    parentCca3: 'GBR',
    commonName: 'Gran Bretaña',
    officialName: 'Isla de Gran Bretaña (región geográfica del Reino Unido)',
    englishCommonName: 'Great Britain',
    englishOfficialName: 'Great Britain',
    entityStatusLabel: 'Isla y región geográfica del Reino Unido',
    capital: 'No aplica (isla integrada por Inglaterra, Escocia y Gales)',
    languages: 'Inglés, Galés, Gaélico escocés, Escocés',
    flagUrl: '',
    flagAlt: 'Gran Bretaña forma parte del Reino Unido',
    clarificationNote:
      'Gran Bretaña es la isla que comprende Inglaterra, Escocia y Gales. Forma parte del Reino Unido (que además incluye Irlanda del Norte) y no constituye un país independiente por sí sola.',
    aliases: ['Gran Bretaña', 'Great Britain'],
  },
  {
    code: 'NL-HOL',
    cca2: 'NL-HOL',
    parentCca3: 'NLD',
    commonName: 'Holanda',
    officialName: 'Holanda (región histórica de los Países Bajos)',
    englishCommonName: 'Holland',
    englishOfficialName: 'Holland',
    entityStatusLabel: 'Región histórica de los Países Bajos',
    capital: 'No aplica como Estado (región dividida en Holanda Septentrional y Meridional)',
    languages: 'Neerlandés',
    flagUrl: '',
    flagAlt: 'Holanda es una región de los Países Bajos',
    clarificationNote:
      'Holanda es una región histórica del oeste de los Países Bajos. Aunque suele utilizarse popularmente como sinónimo, el nombre oficial del país completo es Países Bajos.',
    aliases: ['Holanda', 'Holland'],
  },
  {
    code: 'ES-CT',
    cca2: 'ES-CT',
    parentCca3: 'ESP',
    commonName: 'Cataluña',
    officialName: 'Comunidad Autónoma de Cataluña',
    englishCommonName: 'Catalonia',
    englishOfficialName: 'Catalonia',
    entityStatusLabel: 'Comunidad autónoma de España',
    capital: 'Barcelona',
    languages: 'Español, Catalán, Occitano (aranés)',
    flagUrl: '',
    flagAlt: 'Cataluña forma parte de España',
    clarificationNote:
      'Cataluña es una comunidad autónoma que forma parte de España y no figura como país independiente en REST Countries. La moneda y el código telefónico corresponden a España.',
    aliases: ['Cataluña', 'Catalunya', 'Catalonia'],
  },
  {
    code: 'ES-PV',
    cca2: 'ES-PV',
    parentCca3: 'ESP',
    commonName: 'País Vasco',
    officialName: 'Comunidad Autónoma del País Vasco (Euskadi)',
    englishCommonName: 'Basque Country',
    englishOfficialName: 'Basque Country',
    entityStatusLabel: 'Comunidad autónoma de España',
    capital: 'Vitoria-Gasteiz',
    languages: 'Español, Euskera',
    flagUrl: '',
    flagAlt: 'El País Vasco forma parte de España',
    clarificationNote:
      'El País Vasco (Euskadi) es una comunidad autónoma que forma parte de España y no es un Estado independiente en REST Countries. La moneda y el código telefónico corresponden a España.',
    aliases: ['País Vasco', 'Euskadi', 'Basque Country'],
  },
  {
    code: 'ES-GA',
    cca2: 'ES-GA',
    parentCca3: 'ESP',
    commonName: 'Galicia',
    officialName: 'Comunidad Autónoma de Galicia',
    englishCommonName: 'Galicia',
    englishOfficialName: 'Galicia',
    entityStatusLabel: 'Comunidad autónoma de España',
    capital: 'Santiago de Compostela',
    languages: 'Español, Gallego',
    flagUrl: '',
    flagAlt: 'Galicia forma parte de España',
    clarificationNote:
      'Galicia es una comunidad autónoma que forma parte de España y no es un país independiente en REST Countries. La moneda y el código telefónico corresponden a España.',
    aliases: ['Galicia', 'Galiza'],
  },
  {
    code: 'ES-CN',
    cca2: 'ES-CN',
    parentCca3: 'ESP',
    commonName: 'Islas Canarias',
    officialName: 'Comunidad Autónoma de Canarias',
    englishCommonName: 'Canary Islands',
    englishOfficialName: 'Canary Islands',
    entityStatusLabel: 'Comunidad autónoma insular de España',
    capital: 'Las Palmas de Gran Canaria y Santa Cruz de Tenerife',
    languages: 'Español',
    flagUrl: '',
    flagAlt: 'Las Islas Canarias forman parte de España',
    clarificationNote:
      'Las Islas Canarias son un archipiélago y comunidad autónoma que forma parte de España. La moneda y el código telefónico corresponden a España en REST Countries.',
    aliases: ['Islas Canarias', 'Canarias', 'Canary Islands'],
  },
  {
    code: 'CA-QC',
    cca2: 'CA-QC',
    parentCca3: 'CAN',
    commonName: 'Quebec',
    officialName: 'Provincia de Quebec',
    englishCommonName: 'Quebec',
    englishOfficialName: 'Québec',
    entityStatusLabel: 'Provincia de Canadá',
    capital: 'Ciudad de Quebec',
    languages: 'Francés',
    flagUrl: '',
    flagAlt: 'Quebec forma parte de Canadá',
    clarificationNote:
      'Quebec es una provincia que forma parte de Canadá y no es un Estado independiente en REST Countries. La moneda y el código telefónico corresponden a Canadá.',
    aliases: ['Quebec', 'Québec'],
  },
  {
    code: 'US-HI',
    cca2: 'US-HI',
    parentCca3: 'USA',
    commonName: 'Hawái',
    officialName: 'Estado de Hawái',
    englishCommonName: 'Hawaii',
    englishOfficialName: 'State of Hawaii',
    entityStatusLabel: 'Estado federado de Estados Unidos',
    capital: 'Honolulu',
    languages: 'Inglés, Hawaiano',
    flagUrl: '',
    flagAlt: 'Hawái forma parte de Estados Unidos',
    clarificationNote:
      'Hawái es un estado insular que forma parte de Estados Unidos y no figura como país independiente en REST Countries. La moneda y el código telefónico corresponden a Estados Unidos.',
    aliases: ['Hawái', 'Hawai', 'Hawaii'],
  },
  {
    code: 'US-AK',
    cca2: 'US-AK',
    parentCca3: 'USA',
    commonName: 'Alaska',
    officialName: 'Estado de Alaska',
    englishCommonName: 'Alaska',
    englishOfficialName: 'State of Alaska',
    entityStatusLabel: 'Estado federado de Estados Unidos',
    capital: 'Juneau',
    languages: 'Inglés',
    flagUrl: '',
    flagAlt: 'Alaska forma parte de Estados Unidos',
    clarificationNote:
      'Alaska es un estado que forma parte de Estados Unidos y no es un país independiente en REST Countries. La moneda y el código telefónico corresponden a Estados Unidos.',
    aliases: ['Alaska'],
  },
  {
    code: 'CN-XZ',
    cca2: 'CN-XZ',
    parentCca3: 'CHN',
    commonName: 'Tíbet',
    officialName: 'Región Autónoma del Tíbet',
    englishCommonName: 'Tibet',
    englishOfficialName: 'Tibet Autonomous Region',
    entityStatusLabel: 'Región autónoma de China',
    capital: 'Lhasa',
    languages: 'Tibetano, Chino mandarín',
    flagUrl: '',
    flagAlt: 'El Tíbet es una región autónoma de China',
    clarificationNote:
      'El Tíbet es una región autónoma administrada por la República Popular China y no figura como país independiente en REST Countries. La moneda y el código telefónico corresponden a China.',
    aliases: ['Tíbet', 'Tibet'],
  },
  {
    code: 'FR-20R',
    cca2: 'FR-20R',
    parentCca3: 'FRA',
    commonName: 'Córcega',
    officialName: 'Colectividad Territorial de Córcega',
    englishCommonName: 'Corsica',
    englishOfficialName: 'Corsica',
    entityStatusLabel: 'Colectividad territorial insular de Francia',
    capital: 'Ajaccio',
    languages: 'Francés, Corso',
    flagUrl: '',
    flagAlt: 'Córcega forma parte de Francia',
    clarificationNote:
      'Córcega es una isla y colectividad territorial que forma parte de Francia. La moneda y el código telefónico corresponden a Francia en REST Countries.',
    aliases: ['Córcega', 'Corse', 'Corsica'],
  },
  {
    code: 'IT-82',
    cca2: 'IT-82',
    parentCca3: 'ITA',
    commonName: 'Sicilia',
    officialName: 'Región Autónoma de Sicilia',
    englishCommonName: 'Sicily',
    englishOfficialName: 'Sicily',
    entityStatusLabel: 'Región autónoma insular de Italia',
    capital: 'Palermo',
    languages: 'Italiano, Siciliano',
    flagUrl: '',
    flagAlt: 'Sicilia forma parte de Italia',
    clarificationNote:
      'Sicilia es una isla y región autónoma que forma parte de Italia. La moneda y el código telefónico corresponden a Italia en REST Countries.',
    aliases: ['Sicilia', 'Sicily'],
  },
  {
    code: 'IT-88',
    cca2: 'IT-88',
    parentCca3: 'ITA',
    commonName: 'Cerdeña',
    officialName: 'Región Autónoma de Cerdeña',
    englishCommonName: 'Sardinia',
    englishOfficialName: 'Sardinia',
    entityStatusLabel: 'Región autónoma insular de Italia',
    capital: 'Cagliari',
    languages: 'Italiano, Sardo',
    flagUrl: '',
    flagAlt: 'Cerdeña forma parte de Italia',
    clarificationNote:
      'Cerdeña es una isla y región autónoma que forma parte de Italia. La moneda y el código telefónico corresponden a Italia en REST Countries.',
    aliases: ['Cerdeña', 'Sardegna', 'Sardinia'],
  },
  {
    code: 'DE-BY',
    cca2: 'DE-BY',
    parentCca3: 'DEU',
    commonName: 'Baviera',
    officialName: 'Estado Libre de Baviera',
    englishCommonName: 'Bavaria',
    englishOfficialName: 'Free State of Bavaria',
    entityStatusLabel: 'Estado federado de Alemania',
    capital: 'Múnich',
    languages: 'Alemán',
    flagUrl: '',
    flagAlt: 'Baviera forma parte de Alemania',
    clarificationNote:
      'Baviera es un estado federado que forma parte de Alemania y no un país independiente en REST Countries. La moneda y el código telefónico corresponden a Alemania.',
    aliases: ['Baviera', 'Bayern', 'Bavaria'],
  },
  {
    code: 'AU-TAS',
    cca2: 'AU-TAS',
    parentCca3: 'AUS',
    commonName: 'Tasmania',
    officialName: 'Estado de Tasmania',
    englishCommonName: 'Tasmania',
    englishOfficialName: 'Tasmania',
    entityStatusLabel: 'Estado insular de Australia',
    capital: 'Hobart',
    languages: 'Inglés',
    flagUrl: '',
    flagAlt: 'Tasmania forma parte de Australia',
    clarificationNote:
      'Tasmania es un estado insular que forma parte de Australia y no un país independiente en REST Countries. La moneda y el código telefónico corresponden a Australia.',
    aliases: ['Tasmania'],
  },
  {
    code: 'TZ-ZNZ',
    cca2: 'TZ-ZNZ',
    parentCca3: 'TZA',
    commonName: 'Zanzíbar',
    officialName: 'Gobierno Revolucionario de Zanzíbar',
    englishCommonName: 'Zanzibar',
    englishOfficialName: 'Zanzibar',
    entityStatusLabel: 'Región semiautónoma de Tanzania',
    capital: 'Ciudad de Zanzíbar',
    languages: 'Suajili, Inglés, Árabe',
    flagUrl: '',
    flagAlt: 'Zanzíbar forma parte de Tanzania',
    clarificationNote:
      'Zanzíbar es un archipiélago y región semiautónoma que forma parte de Tanzania. La moneda y el código telefónico corresponden a Tanzania en REST Countries.',
    aliases: ['Zanzíbar', 'Zanzibar'],
  },
  {
    code: 'CL-IP',
    cca2: 'CL-IP',
    parentCca3: 'CHL',
    commonName: 'Isla de Pascua',
    officialName: 'Rapa Nui / Isla de Pascua (territorio especial de Chile)',
    englishCommonName: 'Easter Island',
    englishOfficialName: 'Easter Island',
    entityStatusLabel: 'Territorio insular especial de Chile',
    capital: 'Hanga Roa',
    languages: 'Español, Rapanui',
    flagUrl: '',
    flagAlt: 'Isla de Pascua forma parte de Chile',
    clarificationNote:
      'La Isla de Pascua (Rapa Nui) es un territorio insular especial que forma parte de Chile. La moneda y el código telefónico corresponden a Chile en REST Countries.',
    aliases: ['Isla de Pascua', 'Rapa Nui', 'Easter Island'],
  },
  {
    code: 'EC-W',
    cca2: 'EC-W',
    parentCca3: 'ECU',
    commonName: 'Islas Galápagos',
    officialName: 'Provincia de Galápagos',
    englishCommonName: 'Galápagos Islands',
    englishOfficialName: 'Galápagos Province',
    entityStatusLabel: 'Provincia insular de Ecuador',
    capital: 'Puerto Baquerizo Moreno',
    languages: 'Español',
    flagUrl: '',
    flagAlt: 'Las Islas Galápagos forman parte de Ecuador',
    clarificationNote:
      'Las Islas Galápagos son un archipiélago y provincia que forma parte de Ecuador. La moneda y el código telefónico corresponden a Ecuador en REST Countries.',
    aliases: ['Islas Galápagos', 'Galápagos', 'Galapagos'],
  },
];

const spanishLanguageDisplayNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['es'], { type: 'language' })
    : null;

export function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function capitalizeFirst(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function translateContinent(continent: string): string {
  return CONTINENT_TRANSLATIONS[continent] ?? continent;
}

function translateRegion(region: string): string {
  return REGION_TRANSLATIONS[region] ?? region;
}

function translateSubregion(subregion: string): string {
  return SUBREGION_TRANSLATIONS[subregion] ?? subregion;
}

function formatLanguage(code: string, englishName: string): string {
  if (LANGUAGE_FALLBACK_TRANSLATIONS[code]) {
    return LANGUAGE_FALLBACK_TRANSLATIONS[code];
  }
  if (spanishLanguageDisplayNames) {
    try {
      const translated = spanishLanguageDisplayNames.of(code);
      if (translated && translated.toLowerCase() !== code.toLowerCase()) {
        return capitalizeFirst(translated);
      }
    } catch {
      // Fallback to English name provided by REST Countries if ISO code is non-standard
    }
  }
  return englishName;
}

function formatLanguages(languages?: Record<string, string>): string {
  if (!languages || Object.keys(languages).length === 0) {
    return 'No registrado';
  }
  const formatted = Object.entries(languages).map(([code, englishName]) =>
    formatLanguage(code, englishName)
  );
  return Array.from(new Set(formatted)).join(', ');
}

function formatCurrencies(
  currencies?: Record<string, { name?: string; symbol?: string }>
): string {
  if (!currencies || Object.keys(currencies).length === 0) {
    return 'Sin moneda oficial';
  }
  const items = Object.entries(currencies).map(([code, info]) => {
    const name = info?.name ? capitalizeFirst(info.name) : code;
    const symbol = info?.symbol ? `${info.symbol} · ` : '';
    return `${name} (${symbol}${code})`;
  });
  return items.join(', ');
}

function formatCallingCode(idd?: { root?: string; suffixes?: string[] }): string {
  const root = idd?.root?.trim();
  if (!root) {
    return 'No disponible';
  }
  const suffixes = Array.isArray(idd?.suffixes)
    ? idd.suffixes.map((s) => s.trim()).filter(Boolean)
    : [];

  if (suffixes.length === 0 || suffixes.length > 4) {
    return root;
  }
  return suffixes.map((suffix) => `${root}${suffix}`).join(', ');
}

function formatNumberEs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'No disponible';
  }
  return new Intl.NumberFormat('es-ES').format(value);
}

function formatAreaEs(area: number | null): string {
  if (area === null || !Number.isFinite(area)) {
    return 'No disponible';
  }
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(area)} km²`;
}

function getRestCountriesConfig(): { baseUrl: string; apiKey: string | undefined } {
  const rawBaseUrl = process.env.REST_COUNTRIES_API_BASE_URL?.trim();
  const baseUrl = (rawBaseUrl || DEFAULT_REST_COUNTRIES_BASE_URL).replace(/\/+$/, '');
  const apiKey = process.env.REST_COUNTRIES_API_KEY?.trim() || undefined;
  return { baseUrl, apiKey };
}

function buildRequestHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function fetchJsonWithTimeout<T>(url: string, headers: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} al consultar ${url}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromRestCountriesV31(
  baseUrl: string,
  headers: Record<string, string>
): Promise<RawRestCountry[] | null> {
  try {
    const batchAUrl = `${baseUrl}/all?fields=cca3,cca2,independent,name,translations,flags,capital,population,continents,region,subregion`;
    const batchBUrl = `${baseUrl}/all?fields=cca3,languages,currencies,area,idd,altSpellings`;

    const [batchA, batchB] = await Promise.all([
      fetchJsonWithTimeout<unknown>(batchAUrl, headers),
      fetchJsonWithTimeout<unknown>(batchBUrl, headers),
    ]);

    if (!Array.isArray(batchA) || !Array.isArray(batchB) || batchA.length === 0) {
      return null;
    }

    const extraByCode = new Map<string, RawRestCountry>();
    for (const item of batchB as RawRestCountry[]) {
      if (item?.cca3) {
        extraByCode.set(item.cca3, item);
      }
    }

    return (batchA as RawRestCountry[]).map((item) => {
      const extra = item.cca3 ? extraByCode.get(item.cca3) : undefined;
      return {
        ...item,
        ...extra,
      };
    });
  } catch {
    return null;
  }
}

async function fetchFromOfficialV31Repository(): Promise<RawRestCountry[]> {
  const data = await fetchJsonWithTimeout<unknown>(OFFICIAL_REST_COUNTRIES_V31_DATASET_URL, {
    Accept: 'application/json',
  });
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('La respuesta del catálogo de países no tiene el formato esperado.');
  }
  return data as RawRestCountry[];
}

function mapRawCountry(raw: RawRestCountry): IndexedCountry | null {
  const cca3 = raw.cca3?.trim();
  const cca2 = raw.cca2?.trim() ?? '';
  const englishCommon = raw.name?.common?.trim();
  if (!cca3 || !englishCommon) {
    return null;
  }

  const englishOfficial = raw.name?.official?.trim() || englishCommon;
  const spanishCommon =
    raw.translations?.spa?.common?.trim() ||
    raw.name?.nativeName?.spa?.common?.trim() ||
    englishCommon;
  const spanishOfficialRaw =
    raw.translations?.spa?.official?.trim() ||
    raw.name?.nativeName?.spa?.official?.trim() ||
    englishOfficial;
  const spanishOfficial = capitalizeFirst(spanishOfficialRaw);

  const flagUrl = raw.flags?.svg || raw.flags?.png || '';
  const flagAlt = raw.flags?.alt?.trim() || `Bandera de ${spanishCommon}`;

  const capital =
    Array.isArray(raw.capital) && raw.capital.length > 0
      ? raw.capital.map((c) => c.trim()).filter(Boolean).join(', ')
      : 'No registrada';

  const population = typeof raw.population === 'number' ? raw.population : null;
  const continentsList = Array.isArray(raw.continents)
    ? raw.continents.map((c) => translateContinent(c)).filter(Boolean)
    : [];
  const continent = continentsList.length > 0 ? continentsList.join(', ') : 'No registrado';

  const region = raw.region ? translateRegion(raw.region) : 'No registrada';
  const subregion = raw.subregion ? translateSubregion(raw.subregion) : '';

  const area = typeof raw.area === 'number' ? raw.area : null;

  const territoryMeta = TERRITORY_PARENT_MAP[cca3];
  const entityKind: TerritoryKind = territoryMeta || raw.independent === false ? 'territory' : 'country';
  const entityStatusLabel =
    territoryMeta?.statusLabel ??
    (raw.independent === false ? 'Territorio no independiente' : 'País soberano');

  const details: CountryDetails = {
    code: cca3,
    cca2,
    commonName: spanishCommon,
    officialName: spanishOfficial,
    englishCommonName: englishCommon,
    englishOfficialName: englishOfficial,
    flagUrl,
    flagAlt,
    capital,
    population,
    populationFormatted: formatNumberEs(population),
    continent,
    region,
    subregion,
    languages: formatLanguages(raw.languages),
    currencies: formatCurrencies(raw.currencies),
    area,
    areaFormatted: formatAreaEs(area),
    callingCode: formatCallingCode(raw.idd),
    entityKind,
    entityStatusLabel,
  };

  const suggestion: CountrySuggestion = {
    code: cca3,
    cca2,
    commonName: spanishCommon,
    officialName: spanishOfficial,
    flagUrl,
    flagAlt,
    continent,
    region,
    entityKind,
    entityStatusLabel,
  };

  const rawSearchCandidates = new Set<string>();
  rawSearchCandidates.add(spanishCommon);
  rawSearchCandidates.add(spanishOfficial);
  rawSearchCandidates.add(englishCommon);
  rawSearchCandidates.add(englishOfficial);

  if (raw.name?.nativeName) {
    for (const native of Object.values(raw.name.nativeName)) {
      if (native?.common) rawSearchCandidates.add(native.common);
      if (native?.official) rawSearchCandidates.add(native.official);
    }
  }

  if (Array.isArray(raw.altSpellings)) {
    for (const alt of raw.altSpellings) {
      // Avoid indexing "Great Britain" directly on GBR so Gran Bretaña resolves to GB-GBR without conflation
      if (cca3 === 'GBR' && normalizeText(alt) === 'great britain') {
        continue;
      }
      if (alt) rawSearchCandidates.add(alt);
    }
  }

  const spanishAliases = COUNTRY_SPANISH_ALIASES[cca3];
  if (spanishAliases) {
    for (const alias of spanishAliases) {
      rawSearchCandidates.add(alias);
    }
  }

  const normalizedNames = Array.from(rawSearchCandidates)
    .map(normalizeText)
    .filter(Boolean);

  return {
    details,
    suggestion,
    primarySpanishCommon: normalizeText(spanishCommon),
    primarySpanishOfficial: normalizeText(spanishOfficial),
    primaryEnglishCommon: normalizeText(englishCommon),
    primaryEnglishOfficial: normalizeText(englishOfficial),
    isoCodes: [normalizeText(cca2), normalizeText(cca3)].filter(Boolean),
    searchableNames: Array.from(new Set(normalizedNames)),
  };
}

function buildConstituentTerritoryEntry(
  spec: SubNationalRegionSpec,
  parent: IndexedCountry
): IndexedCountry {
  const parentInfo: ParentStateInfo = {
    code: parent.details.code,
    name: parent.details.commonName,
    officialName: parent.details.officialName,
  };

  const details: CountryDetails = {
    code: spec.code,
    cca2: spec.cca2,
    commonName: spec.commonName,
    officialName: spec.officialName,
    englishCommonName: spec.englishCommonName,
    englishOfficialName: spec.englishOfficialName,
    flagUrl: spec.flagUrl,
    flagAlt: spec.flagAlt,
    capital: spec.capital,
    population: null,
    populationFormatted: 'Sin dato específico en REST Countries',
    continent: parent.details.continent,
    region: parent.details.region,
    subregion: parent.details.subregion,
    languages: spec.languages,
    currencies: `${parent.details.currencies} (${parent.details.commonName})`,
    area: null,
    areaFormatted: 'Sin dato específico en REST Countries',
    callingCode: `${parent.details.callingCode} (${parent.details.commonName})`,
    entityKind: 'constituent-region',
    entityStatusLabel: spec.entityStatusLabel,
    parentCountry: parentInfo,
    clarificationNote: spec.clarificationNote,
  };

  const suggestion: CountrySuggestion = {
    code: spec.code,
    cca2: spec.cca2,
    commonName: spec.commonName,
    officialName: spec.officialName,
    flagUrl: spec.flagUrl,
    flagAlt: spec.flagAlt,
    continent: parent.details.continent,
    region: parent.details.region,
    entityKind: 'constituent-region',
    entityStatusLabel: spec.entityStatusLabel,
    parentCountry: parentInfo,
  };

  const rawCandidates = [
    spec.commonName,
    spec.officialName,
    spec.englishCommonName,
    spec.englishOfficialName,
    ...spec.aliases,
  ];

  const searchableNames = Array.from(
    new Set(rawCandidates.map(normalizeText).filter(Boolean))
  );

  return {
    details,
    suggestion,
    primarySpanishCommon: normalizeText(spec.commonName),
    primarySpanishOfficial: normalizeText(spec.officialName),
    primaryEnglishCommon: normalizeText(spec.englishCommonName),
    primaryEnglishOfficial: normalizeText(spec.englishOfficialName),
    isoCodes: [normalizeText(spec.code), normalizeText(spec.cca2)].filter(Boolean),
    searchableNames,
  };
}

async function loadCountriesIndex(): Promise<IndexedCountry[]> {
  const now = Date.now();
  if (cachedCountries && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedCountries;
  }

  if (inFlightLoad) {
    return inFlightLoad;
  }

  inFlightLoad = (async () => {
    try {
      const { baseUrl, apiKey } = getRestCountriesConfig();
      const headers = buildRequestHeaders(apiKey);

      let rawCountries = await fetchFromRestCountriesV31(baseUrl, headers);
      if (!rawCountries) {
        rawCountries = await fetchFromOfficialV31Repository();
      }

      // 1. Deduplicate REST Countries records strictly by cca3 code
      const dedupedMap = new Map<string, IndexedCountry>();
      for (const raw of rawCountries) {
        const mapped = mapRawCountry(raw);
        if (mapped && !dedupedMap.has(mapped.details.code)) {
          dedupedMap.set(mapped.details.code, mapped);
        }
      }

      // 2. Link REST Countries non-independent territories to their parent sovereign state
      const relatedByParent = new Map<string, RelatedTerritoryLink[]>();

      for (const entry of dedupedMap.values()) {
        const meta = TERRITORY_PARENT_MAP[entry.details.code];
        if (meta) {
          const parent = dedupedMap.get(meta.parentCca3);
          if (parent) {
            const parentInfo: ParentStateInfo = {
              code: parent.details.code,
              name: parent.details.commonName,
              officialName: parent.details.officialName,
            };
            entry.details.parentCountry = parentInfo;
            entry.suggestion.parentCountry = parentInfo;
            entry.details.clarificationNote = `${entry.details.commonName} es un territorio dependiente o asociado que forma parte de ${parent.details.commonName} (${meta.statusLabel}), y cuenta con ficha propia en REST Countries.`;

            const existingLinks = relatedByParent.get(parent.details.code) ?? [];
            existingLinks.push({
              code: entry.details.code,
              name: entry.details.commonName,
              statusLabel: meta.statusLabel,
            });
            relatedByParent.set(parent.details.code, existingLinks);
          }
        }
      }

      // 3. Build sub-national constituent territories/regions using live parent data
      for (const spec of CONSTITUENT_TERRITORIES) {
        const parent = dedupedMap.get(spec.parentCca3);
        if (!parent || dedupedMap.has(spec.code)) {
          continue;
        }
        const regionalEntry = buildConstituentTerritoryEntry(spec, parent);
        dedupedMap.set(regionalEntry.details.code, regionalEntry);

        const existingLinks = relatedByParent.get(parent.details.code) ?? [];
        existingLinks.push({
          code: regionalEntry.details.code,
          name: regionalEntry.details.commonName,
          statusLabel: spec.entityStatusLabel,
        });
        relatedByParent.set(parent.details.code, existingLinks);
      }

      // 4. Attach constituent/related territory links to parent sovereign states (e.g. Reino Unido -> Inglaterra, Escocia, Gales, Irlanda del Norte, Gran Bretaña)
      for (const [parentCode, links] of relatedByParent.entries()) {
        const parent = dedupedMap.get(parentCode);
        if (parent) {
          parent.details.relatedTerritories = links.sort((a, b) =>
            a.name.localeCompare(b.name, 'es')
          );
        }
      }

      const list = Array.from(dedupedMap.values()).sort((a, b) =>
        a.details.commonName.localeCompare(b.details.commonName, 'es')
      );

      cachedCountries = list;
      cacheTimestamp = Date.now();
      return list;
    } finally {
      inFlightLoad = null;
    }
  })();

  return inFlightLoad;
}

function scoreMatch(entry: IndexedCountry, normalizedQuery: string): number {
  if (!normalizedQuery) return -1;

  if (
    entry.primarySpanishCommon === normalizedQuery ||
    entry.primarySpanishOfficial === normalizedQuery ||
    entry.primaryEnglishCommon === normalizedQuery ||
    entry.primaryEnglishOfficial === normalizedQuery ||
    entry.isoCodes.includes(normalizedQuery)
  ) {
    return 1000;
  }

  if (entry.primarySpanishCommon.startsWith(normalizedQuery)) {
    return 850;
  }

  if (
    entry.primarySpanishOfficial.startsWith(normalizedQuery) ||
    entry.primaryEnglishCommon.startsWith(normalizedQuery) ||
    entry.primaryEnglishOfficial.startsWith(normalizedQuery)
  ) {
    return 750;
  }

  const wordBoundaryRegex = new RegExp(
    `(?:^|\\s)${normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
  );

  if (wordBoundaryRegex.test(entry.primarySpanishCommon)) {
    return 650;
  }

  if (
    wordBoundaryRegex.test(entry.primarySpanishOfficial) ||
    wordBoundaryRegex.test(entry.primaryEnglishCommon) ||
    wordBoundaryRegex.test(entry.primaryEnglishOfficial)
  ) {
    return 550;
  }

  if (entry.primarySpanishCommon.includes(normalizedQuery)) {
    return 450;
  }

  if (
    entry.primarySpanishOfficial.includes(normalizedQuery) ||
    entry.primaryEnglishCommon.includes(normalizedQuery) ||
    entry.primaryEnglishOfficial.includes(normalizedQuery)
  ) {
    return 350;
  }

  for (const name of entry.searchableNames) {
    if (name === normalizedQuery) return 950;
    if (name.startsWith(normalizedQuery)) return 400;
    if (name.includes(normalizedQuery)) return 250;
  }

  return -1;
}

function findMatchedEntries(index: IndexedCountry[], rawQuery: string): IndexedCountry[] {
  const normalizedQuery = normalizeText(rawQuery);
  if (!normalizedQuery) {
    return [];
  }

  const scored: Array<{ entry: IndexedCountry; score: number }> = [];
  const seenCodes = new Set<string>();

  for (const entry of index) {
    if (seenCodes.has(entry.details.code)) {
      continue;
    }
    const score = scoreMatch(entry, normalizedQuery);
    if (score >= 0) {
      seenCodes.add(entry.details.code);
      scored.push({ entry, score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.entry.details.commonName.localeCompare(b.entry.details.commonName, 'es');
  });

  return scored.map((item) => item.entry);
}

export async function getCountrySuggestions(
  query: string,
  limit = 8
): Promise<CountrySuggestion[]> {
  const index = await loadCountriesIndex();
  const matches = findMatchedEntries(index, query);
  return matches.slice(0, Math.max(1, Math.min(limit, 20))).map((item) => item.suggestion);
}

export async function searchCountries(query: string): Promise<CountryDetails[]> {
  const index = await loadCountriesIndex();
  const matches = findMatchedEntries(index, query);
  return matches.map((item) => item.details);
}

export async function getCountryByCode(code: string): Promise<CountryDetails | null> {
  const normalizedCode = normalizeText(code);
  if (!normalizedCode) {
    return null;
  }
  const index = await loadCountriesIndex();
  const found = index.find(
    (item) =>
      normalizeText(item.details.code) === normalizedCode ||
      normalizeText(item.details.cca2) === normalizedCode
  );
  return found ? found.details : null;
}
