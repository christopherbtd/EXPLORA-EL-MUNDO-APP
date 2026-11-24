/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountryDetailResponse,
  CountryDetails,
  CountrySearchResponse,
  CountrySuggestResponse,
  CountrySuggestion,
} from '../types/country';

export class CountriesApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'CountriesApiError';
    this.status = status;
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new CountriesApiError(
      'No se recibió una respuesta válida del servidor.',
      response.status
    );
  }

  if (!response.ok) {
    const errorMessage =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : 'Ocurrió un error al consultar la información del país.';
    throw new CountriesApiError(errorMessage, response.status);
  }

  return payload as T;
}

export async function fetchCountrySuggestions(
  query: string,
  signal?: AbortSignal,
  limit = 8
): Promise<CountrySuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const params = new URLSearchParams({
      q: trimmed,
      limit: String(limit),
    });
    const response = await fetch(`/api/countries/suggest?${params.toString()}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    const data = await parseJsonResponse<CountrySuggestResponse>(response);
    return data.suggestions;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    if (error instanceof CountriesApiError) {
      throw error;
    }
    throw new CountriesApiError(
      'Error de conexión al buscar sugerencias. Verifica tu red e inténtalo de nuevo.'
    );
  }
}

export async function searchCountriesByQuery(
  query: string,
  signal?: AbortSignal
): Promise<CountryDetails[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const params = new URLSearchParams({ q: trimmed });
    const response = await fetch(`/api/countries/search?${params.toString()}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    const data = await parseJsonResponse<CountrySearchResponse>(response);
    return data.results;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    if (error instanceof CountriesApiError) {
      throw error;
    }
    throw new CountriesApiError(
      'No se pudo conectar con el servidor. Verifica tu conexión a internet e inténtalo nuevamente.'
    );
  }
}

export async function fetchCountryByCode(
  code: string,
  signal?: AbortSignal
): Promise<CountryDetails> {
  try {
    const response = await fetch(`/api/countries/${encodeURIComponent(code)}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    const data = await parseJsonResponse<CountryDetailResponse>(response);
    return data.country;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    if (error instanceof CountriesApiError) {
      throw error;
    }
    throw new CountriesApiError(
      'No se pudo conectar con el servidor al cargar el país seleccionado.'
    );
  }
}
