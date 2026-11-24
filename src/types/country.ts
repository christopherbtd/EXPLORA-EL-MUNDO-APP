/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TerritoryKind = 'country' | 'territory' | 'constituent-region';

export interface ParentStateInfo {
  code: string;
  name: string;
  officialName: string;
}

export interface RelatedTerritoryLink {
  code: string;
  name: string;
  statusLabel: string;
}

export interface CountrySuggestion {
  code: string;
  cca2: string;
  commonName: string;
  officialName: string;
  flagUrl: string;
  flagAlt: string;
  continent: string;
  region: string;
  entityKind: TerritoryKind;
  entityStatusLabel: string;
  parentCountry?: ParentStateInfo;
}

export interface CountryDetails extends CountrySuggestion {
  englishCommonName: string;
  englishOfficialName: string;
  capital: string;
  population: number | null;
  populationFormatted: string;
  subregion: string;
  languages: string;
  currencies: string;
  area: number | null;
  areaFormatted: string;
  callingCode: string;
  clarificationNote?: string;
  relatedTerritories?: RelatedTerritoryLink[];
}

export interface CountrySuggestResponse {
  query: string;
  suggestions: CountrySuggestion[];
}

export interface CountrySearchResponse {
  query: string;
  results: CountryDetails[];
  total: number;
}

export interface CountryDetailResponse {
  country: CountryDetails;
}
