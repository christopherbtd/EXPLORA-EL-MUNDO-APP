/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import {
  fetchCountryByCode,
  fetchCountrySuggestions,
  searchCountriesByQuery,
} from './services/countriesApi';
import type { CountryDetails, CountrySuggestion } from './types/country';

type SearchViewState =
  | { status: 'empty' }
  | { status: 'loading'; query: string }
  | { status: 'not-found'; query: string }
  | { status: 'error'; message: string; lastAction: () => void }
  | { status: 'found'; country: CountryDetails; alternatives: CountryDetails[] };

interface DetailFieldProps {
  icon: string;
  label: string;
  value: string;
  id?: string;
  mono?: boolean;
  muted?: boolean;
}

function DetailField({
  icon,
  label,
  value,
  id,
  mono = false,
  muted = false,
}: DetailFieldProps) {
  return (
    <div className="p-gutter-md rounded-md bg-light-surface-container-low border border-light-outline-variant/50 flex flex-col gap-gutter-xs">
      <dt
        data-design-text-token="label-md"
        className="font-label text-label-md text-light-on-surface-variant uppercase tracking-wider flex items-center gap-1.5"
      >
        <span
          className="material-symbols-outlined text-[16px] text-light-primary"
          aria-hidden="true"
        >
          {icon}
        </span>
        <span>{label}</span>
      </dt>
      <dd
        id={id}
        data-design-text-token={muted ? 'body-md' : mono ? 'mono-md' : 'title-md'}
        className={
          muted
            ? 'font-body text-body-md text-light-on-surface-variant break-words'
            : mono
              ? 'font-mono text-mono-md text-light-on-surface tabular-nums break-words'
              : 'font-title text-title-md text-light-on-surface break-words'
        }
      >
        {value}
      </dd>
    </div>
  );
}

export default function App() {
  const [queryInput, setQueryInput] = useState('');
  const [viewState, setViewState] = useState<SearchViewState>({ status: 'empty' });
  const [suggestions, setSuggestions] = useState<CountrySuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeSearchControllerRef = useRef<AbortController | null>(null);
  const skipNextSuggestRef = useRef(false);

  const listboxId = useId();

  // Close autocomplete dropdown on outside click
  useEffect(() => {
    function handleOutsidePointerDown(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
        setHighlightedIndex(-1);
      }
    }

    document.addEventListener('mousedown', handleOutsidePointerDown);
    return () => document.removeEventListener('mousedown', handleOutsidePointerDown);
  }, []);

  // Cancel active search request on unmount
  useEffect(() => {
    return () => {
      activeSearchControllerRef.current?.abort();
    };
  }, []);

  // Debounced autocomplete suggestions as user types
  useEffect(() => {
    if (skipNextSuggestRef.current) {
      skipNextSuggestRef.current = false;
      return;
    }

    const trimmed = queryInput.trim();
    if (!trimmed) {
      setSuggestions([]);
      setIsSuggesting(false);
      setSuggestionsError(null);
      setIsDropdownOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    const controller = new AbortController();
    setIsSuggesting(true);
    setSuggestionsError(null);

    const timer = window.setTimeout(async () => {
      try {
        const items = await fetchCountrySuggestions(trimmed, controller.signal, 8);
        setSuggestions(items);
        setIsSuggesting(false);
        setIsDropdownOpen(true);
        setHighlightedIndex(-1);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setIsSuggesting(false);
        setSuggestions([]);
        setSuggestionsError(
          error instanceof Error ? error.message : 'No se pudieron cargar las sugerencias.'
        );
        setIsDropdownOpen(true);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [queryInput]);

  const executeSelectCountryByCode = async (
    code: string,
    displayName: string,
    alternatives: CountryDetails[] = []
  ) => {
    activeSearchControllerRef.current?.abort();
    const controller = new AbortController();
    activeSearchControllerRef.current = controller;

    skipNextSuggestRef.current = true;
    setQueryInput(displayName);
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
    setViewState({ status: 'loading', query: displayName });

    try {
      const country = await fetchCountryByCode(code, controller.signal);
      setViewState({
        status: 'found',
        country,
        alternatives: alternatives.filter((item) => item.code !== country.code),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo cargar la información del país.';
      setViewState({
        status: 'error',
        message,
        lastAction: () => executeSelectCountryByCode(code, displayName, alternatives),
      });
    }
  };

  const executeSearch = async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      setViewState({ status: 'empty' });
      setIsDropdownOpen(false);
      return;
    }

    activeSearchControllerRef.current?.abort();
    const controller = new AbortController();
    activeSearchControllerRef.current = controller;

    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
    setViewState({ status: 'loading', query: trimmed });

    try {
      const results = await searchCountriesByQuery(trimmed, controller.signal);
      if (results.length === 0) {
        setViewState({ status: 'not-found', query: trimmed });
        return;
      }

      const [primary, ...rest] = results;
      setViewState({
        status: 'found',
        country: primary,
        alternatives: rest.slice(0, 6),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Ocurrió un error al consultar la API de países.';
      setViewState({
        status: 'error',
        message,
        lastAction: () => executeSearch(trimmed),
      });
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isDropdownOpen && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
      const selected = suggestions[highlightedIndex];
      void executeSelectCountryByCode(selected.code, selected.commonName);
      return;
    }

    void executeSearch(queryInput);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setQueryInput(nextValue);

    if (!nextValue.trim()) {
      activeSearchControllerRef.current?.abort();
      setSuggestions([]);
      setIsDropdownOpen(false);
      setHighlightedIndex(-1);
      setViewState({ status: 'empty' });
    }
  };

  const handleClearSearch = () => {
    activeSearchControllerRef.current?.abort();
    skipNextSuggestRef.current = false;
    setQueryInput('');
    setSuggestions([]);
    setSuggestionsError(null);
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
    setViewState({ status: 'empty' });
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen || suggestions.length === 0) {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((prev) =>
        prev <= 0 ? suggestions.length - 1 : prev - 1
      );
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsDropdownOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const handleSelectAlternative = (selectedCountry: CountryDetails) => {
    if (viewState.status !== 'found') return;
    const allOptions = [viewState.country, ...viewState.alternatives];
    skipNextSuggestRef.current = true;
    setQueryInput(selectedCountry.commonName);
    setIsDropdownOpen(false);
    setViewState({
      status: 'found',
      country: selectedCountry,
      alternatives: allOptions.filter((item) => item.code !== selectedCountry.code),
    });
  };

  const activeDescendantId =
    isDropdownOpen && highlightedIndex >= 0 && suggestions[highlightedIndex]
      ? `${listboxId}-option-${suggestions[highlightedIndex].code}`
      : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-light-surface">
      {/* Encabezado */}
      <header className="sticky top-0 z-20 bg-light-surface-container-lowest border-b border-light-outline-variant">
        <div className="max-w-5xl mx-auto px-gutter-md sm:px-gutter-lg py-gutter-md flex items-center justify-between">
          <button
            type="button"
            onClick={handleClearSearch}
            className="flex items-center gap-gutter-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-primary rounded-DEFAULT"
          >
            <span
              className="material-symbols-outlined text-light-primary text-headline-lg"
              aria-hidden="true"
            >
              public
            </span>
            <span
              data-design-text-token="title-lg"
              className="font-headline text-title-lg text-light-on-surface tracking-tight"
            >
              Explora el Mundo
            </span>
          </button>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 flex flex-col items-center justify-center px-gutter-md sm:px-gutter-lg py-gutter-xl sm:py-section">
        <div className="w-full max-w-2xl flex flex-col items-center gap-gutter-lg sm:gap-gutter-xl">
          {/* Título principal */}
          <div className="text-center flex flex-col items-center gap-gutter-sm">
            <h1
              data-component-id="typography-display"
              data-component-type="typography"
              data-component-variant="display"
              data-design-text-token="display-lg"
              className="font-display text-display-lg-mobile md:text-display-lg text-light-on-surface text-balance"
            >
              Descubre cualquier país
            </h1>
          </div>

          {/* Barra de búsqueda + sugerencias */}
          <div ref={searchContainerRef} className="relative w-full">
            <form
              id="country-search-form"
              onSubmit={handleSubmit}
              data-component-id="searchbar-standard"
              data-component-type="searchbar"
              data-component-variant="standard"
              role="search"
              className="flex w-full items-center gap-gutter-xs sm:gap-gutter-sm p-gutter-xs bg-light-surface-container-lowest border border-light-outline-variant rounded-md shadow-sm focus-within:border-light-primary focus-within:ring-2 focus-within:ring-light-primary/20 transition-colors duration-state-change ease-state-change"
            >
              <span
                className="material-symbols-outlined text-light-outline pl-gutter-sm sm:pl-gutter-md text-title-lg shrink-0"
                aria-hidden="true"
              >
                search
              </span>
              <input
                ref={inputRef}
                id="country-input"
                type="search"
                value={queryInput}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                onFocus={() => {
                  if (queryInput.trim() && (suggestions.length > 0 || suggestionsError)) {
                    setIsDropdownOpen(true);
                  }
                }}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isDropdownOpen}
                aria-controls={listboxId}
                aria-activedescendant={activeDescendantId}
                aria-label="Nombre del país"
                placeholder="Escribe el nombre de un país (ej. España, México, Japón)..."
                autoComplete="off"
                className="flex-1 min-w-0 bg-transparent border-0 text-light-on-surface placeholder:text-light-outline font-body text-body-md sm:text-body-lg focus:ring-0 focus:outline-none py-2.5 px-gutter-xs sm:px-gutter-sm [&::-webkit-search-cancel-button]:appearance-none"
              />
              {queryInput.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Limpiar búsqueda"
                  title="Limpiar búsqueda"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-DEFAULT text-light-outline hover:text-light-on-surface hover:bg-light-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-primary transition-colors duration-state-change shrink-0"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                    close
                  </span>
                </button>
              )}
              <button
                type="submit"
                aria-label="Buscar"
                className="inline-flex items-center justify-center px-gutter-md sm:px-gutter-lg py-2.5 rounded-DEFAULT bg-light-primary text-light-on-primary font-label text-label-lg hover:bg-light-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-primary active:scale-95 transition-colors duration-state-change ease-state-change shrink-0"
              >
                <span data-design-text-token="label-lg">Buscar</span>
              </button>
            </form>

            {/* Lista desplegable de sugerencias */}
            {isDropdownOpen && queryInput.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-gutter-xs z-30 bg-light-surface-container-lowest border border-light-outline-variant rounded-md shadow-lg overflow-hidden">
                {isSuggesting && suggestions.length === 0 ? (
                  <div className="px-gutter-md py-gutter-md flex items-center gap-gutter-sm text-light-on-surface-variant font-body text-body-md">
                    <span
                      className="material-symbols-outlined text-[18px] text-light-primary animate-spin"
                      aria-hidden="true"
                    >
                      progress_activity
                    </span>
                    <span>Buscando países...</span>
                  </div>
                ) : suggestionsError ? (
                  <div className="px-gutter-md py-gutter-md flex items-center gap-gutter-sm text-light-error font-body text-body-md">
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      error
                    </span>
                    <span>{suggestionsError}</span>
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="px-gutter-md py-gutter-md flex items-center gap-gutter-sm text-light-on-surface-variant font-body text-body-md">
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      search_off
                    </span>
                    <span>No hay coincidencias para «{queryInput.trim()}»</span>
                  </div>
                ) : (
                  <ul
                    id={listboxId}
                    role="listbox"
                    aria-label="Sugerencias de países"
                    className="max-h-72 overflow-y-auto divide-y divide-light-outline-variant/50"
                  >
                    {suggestions.map((item, idx) => {
                      const isHighlighted = idx === highlightedIndex;
                      const subtitle =
                        item.entityKind !== 'country'
                          ? item.entityStatusLabel
                          : item.officialName.toLowerCase() !== item.commonName.toLowerCase()
                            ? item.officialName
                            : '';

                      return (
                        <li
                          key={item.code}
                          id={`${listboxId}-option-${item.code}`}
                          role="option"
                          aria-selected={isHighlighted}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            void executeSelectCountryByCode(item.code, item.commonName);
                          }}
                          className={`px-gutter-md py-2.5 flex items-center justify-between gap-gutter-md cursor-pointer transition-colors duration-state-change ${
                            isHighlighted
                              ? 'bg-light-surface-container-low'
                              : 'hover:bg-light-surface-container-low'
                          }`}
                        >
                          <div className="flex items-center gap-gutter-md min-w-0">
                            <div className="w-9 h-6 rounded-sm overflow-hidden border border-light-outline-variant bg-light-surface-container-low shrink-0 flex items-center justify-center">
                              {item.flagUrl ? (
                                <img
                                  src={item.flagUrl}
                                  alt=""
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span
                                  className="material-symbols-outlined text-[15px] text-light-outline"
                                  aria-hidden="true"
                                >
                                  location_on
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-title text-title-md text-light-on-surface truncate">
                                {item.commonName}
                              </span>
                              {subtitle && (
                                <span className="font-body text-label-md text-light-on-surface-variant truncate">
                                  {subtitle}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-label text-label-md text-light-on-surface-variant shrink-0 hidden sm:inline">
                            {item.continent}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Tarjeta central de resultados */}
          <article
            id="result-card"
            data-component-id="card-elevated"
            data-component-type="card"
            data-component-variant="elevated"
            className="w-full bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-lg sm:p-gutter-xl shadow-sm"
            aria-live="polite"
          >
            {/* Estado inicial (sin búsqueda) */}
            {viewState.status === 'empty' && (
              <div
                id="empty-state"
                className="py-gutter-lg sm:py-gutter-xl flex flex-col items-center text-center gap-gutter-md"
              >
                <div className="w-14 h-14 rounded-full bg-light-surface-container-low flex items-center justify-center text-light-primary">
                  <span
                    className="material-symbols-outlined text-headline-lg"
                    aria-hidden="true"
                  >
                    travel_explore
                  </span>
                </div>
                <div className="flex flex-col items-center gap-gutter-xs max-w-prose">
                  <h2
                    data-design-text-token="title-lg"
                    className="font-headline text-title-lg text-light-on-surface text-balance"
                  >
                    Busca un país para mostrar su información
                  </h2>
                  <p
                    data-design-text-token="body-md"
                    className="font-body text-body-md text-light-on-surface-variant text-pretty"
                  >
                    Escribe el nombre de cualquier país en español o inglés y selecciona una sugerencia o presiona Buscar para ver su bandera, nombre oficial, capital, población, continente, región, idiomas, moneda, superficie y código telefónico.
                  </p>
                </div>
              </div>
            )}

            {/* Estado cargando */}
            {viewState.status === 'loading' && (
              <div
                id="loading-state"
                className="py-gutter-xl flex flex-col items-center text-center gap-gutter-md"
              >
                <div className="w-14 h-14 rounded-full bg-light-surface-container-low flex items-center justify-center text-light-primary">
                  <span
                    className="material-symbols-outlined text-headline-lg animate-spin"
                    aria-hidden="true"
                  >
                    progress_activity
                  </span>
                </div>
                <div className="flex flex-col items-center gap-gutter-xs max-w-prose">
                  <h2
                    data-design-text-token="title-lg"
                    className="font-headline text-title-lg text-light-on-surface text-balance"
                  >
                    Buscando información
                  </h2>
                  <p
                    data-design-text-token="body-md"
                    className="font-body text-body-md text-light-on-surface-variant text-pretty"
                  >
                    Consultando los datos de «{viewState.query}» en REST Countries...
                  </p>
                </div>
              </div>
            )}

            {/* Estado error de conexión */}
            {viewState.status === 'error' && (
              <div
                id="error-state"
                className="py-gutter-lg sm:py-gutter-xl flex flex-col items-center text-center gap-gutter-md"
              >
                <div className="w-14 h-14 rounded-full bg-light-error-container flex items-center justify-center text-light-on-error-container">
                  <span
                    className="material-symbols-outlined text-headline-lg"
                    aria-hidden="true"
                  >
                    cloud_off
                  </span>
                </div>
                <div className="flex flex-col items-center gap-gutter-xs max-w-prose">
                  <h2
                    data-design-text-token="title-lg"
                    className="font-headline text-title-lg text-light-on-surface text-balance"
                  >
                    Error de conexión
                  </h2>
                  <p
                    data-design-text-token="body-md"
                    className="font-body text-body-md text-light-on-surface-variant text-pretty"
                  >
                    {viewState.message}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-gutter-sm pt-gutter-xs">
                  <button
                    type="button"
                    onClick={viewState.lastAction}
                    className="inline-flex items-center gap-1.5 px-gutter-md py-2 rounded-DEFAULT bg-light-primary text-light-on-primary font-label text-label-lg hover:bg-light-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-primary transition-colors duration-state-change"
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      refresh
                    </span>
                    <span>Reintentar</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="inline-flex items-center gap-1.5 px-gutter-md py-2 rounded-DEFAULT border border-light-outline-variant bg-light-surface-container-lowest text-light-on-surface font-label text-label-lg hover:bg-light-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-primary transition-colors duration-state-change"
                  >
                    <span>Limpiar</span>
                  </button>
                </div>
              </div>
            )}

            {/* Estado sin resultados */}
            {viewState.status === 'not-found' && (
              <div
                id="not-found-state"
                className="py-gutter-lg sm:py-gutter-xl flex flex-col items-center text-center gap-gutter-md"
              >
                <div className="w-14 h-14 rounded-full bg-light-error-container flex items-center justify-center text-light-on-error-container">
                  <span
                    className="material-symbols-outlined text-headline-lg"
                    aria-hidden="true"
                  >
                    search_off
                  </span>
                </div>
                <div className="flex flex-col items-center gap-gutter-xs max-w-prose">
                  <h2
                    data-design-text-token="title-lg"
                    className="font-headline text-title-lg text-light-on-surface text-balance"
                  >
                    No encontramos ese país
                  </h2>
                  <p
                    id="not-found-message"
                    data-design-text-token="body-md"
                    className="font-body text-body-md text-light-on-surface-variant text-pretty"
                  >
                    No encontramos coincidencias para «{viewState.query}». Verifica el nombre e inténtalo nuevamente (por ejemplo: España, México, Japón o Francia).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="inline-flex items-center gap-1.5 px-gutter-md py-2 rounded-DEFAULT border border-light-outline-variant bg-light-surface-container-lowest text-light-on-surface font-label text-label-lg hover:bg-light-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-primary transition-colors duration-state-change"
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    backspace
                  </span>
                  <span>Nueva búsqueda</span>
                </button>
              </div>
            )}

            {/* Estado con resultado del país */}
            {viewState.status === 'found' && (
              <div id="country-result" className="flex flex-col gap-gutter-lg">
                {/* Coincidencias alternativas para búsquedas parciales ambiguas */}
                {viewState.alternatives.length > 0 && (
                  <div className="pb-gutter-md border-b border-light-outline-variant/60 flex flex-col gap-gutter-xs">
                    <span className="font-label text-label-md text-light-on-surface-variant">
                      Otras coincidencias encontradas:
                    </span>
                    <div className="flex flex-wrap gap-gutter-xs">
                      {viewState.alternatives.map((alt) => (
                        <button
                          key={alt.code}
                          type="button"
                          onClick={() => handleSelectAlternative(alt)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-DEFAULT border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container text-light-on-surface font-label text-label-md transition-colors duration-state-change focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-primary"
                        >
                          {alt.flagUrl && (
                            <img
                              src={alt.flagUrl}
                              alt=""
                              className="w-4 h-3 rounded-[2px] object-cover shrink-0"
                            />
                          )}
                          <span>{alt.commonName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-gutter-md pb-gutter-lg border-b border-light-outline-variant">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-gutter-lg min-w-0">
                    <div
                      id="country-flag"
                      className="w-28 h-20 rounded-md overflow-hidden border border-light-outline-variant bg-light-surface-container-low shrink-0 flex items-center justify-center"
                    >
                      {viewState.country.flagUrl ? (
                        <img
                          src={viewState.country.flagUrl}
                          alt={viewState.country.flagAlt}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span
                          className="material-symbols-outlined text-light-outline text-headline-lg"
                          aria-hidden="true"
                        >
                          flag
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-gutter-xs min-w-0">
                      <span
                        data-design-text-token="label-md"
                        className="font-label text-label-md text-light-primary uppercase tracking-wider"
                      >
                        {viewState.country.entityStatusLabel} · {viewState.country.code}
                      </span>
                      <h2
                        id="country-name"
                        data-design-text-token="headline-lg"
                        className="font-headline text-headline-lg text-light-on-surface text-balance"
                      >
                        {viewState.country.commonName}
                      </h2>
                      <p
                        id="country-official-name"
                        data-design-text-token="body-md"
                        className="font-body text-body-md text-light-on-surface-variant text-pretty"
                      >
                        <span className="font-semibold text-light-on-surface">
                          Nombre oficial:
                        </span>{' '}
                        {viewState.country.officialName}
                      </p>
                    </div>
                  </div>
                </header>

                {/* Aclaración contextual para territorios o regiones dependientes */}
                {(viewState.country.clarificationNote || viewState.country.parentCountry) && (
                  <div
                    id="territory-clarification"
                    className="p-gutter-md rounded-md bg-light-surface-container-low border border-light-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-gutter-md"
                  >
                    <div className="flex items-start gap-gutter-sm min-w-0">
                      <span
                        className="material-symbols-outlined text-[20px] text-light-primary shrink-0 mt-0.5"
                        aria-hidden="true"
                      >
                        info
                      </span>
                      <div className="flex flex-col gap-1 min-w-0">
                        {viewState.country.parentCountry && (
                          <p className="font-label text-label-lg text-light-on-surface">
                            Forma parte de: {viewState.country.parentCountry.name}
                          </p>
                        )}
                        {viewState.country.clarificationNote && (
                          <p className="font-body text-body-md text-light-on-surface-variant text-pretty">
                            {viewState.country.clarificationNote}
                          </p>
                        )}
                      </div>
                    </div>
                    {viewState.country.parentCountry && (
                      <button
                        type="button"
                        onClick={() => {
                          const parent = viewState.country.parentCountry!;
                          void executeSelectCountryByCode(parent.code, parent.name);
                        }}
                        className="inline-flex items-center justify-center gap-1 px-gutter-md py-2 rounded-DEFAULT border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container text-light-primary font-label text-label-md transition-colors duration-state-change shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-primary"
                      >
                        <span>Ver {viewState.country.parentCountry.name}</span>
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                          arrow_forward
                        </span>
                      </button>
                    )}
                  </div>
                )}

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-md">
                  <DetailField
                    id="country-capital"
                    icon="location_city"
                    label="Capital"
                    value={viewState.country.capital}
                    muted={viewState.country.capital.startsWith('No aplica') || viewState.country.capital === 'No registrada'}
                  />
                  <DetailField
                    id="country-population"
                    icon="groups"
                    label="Población"
                    value={viewState.country.populationFormatted}
                    mono={viewState.country.population !== null}
                    muted={viewState.country.population === null}
                  />
                  <DetailField
                    id="country-continent"
                    icon="public"
                    label="Continente"
                    value={viewState.country.continent}
                  />
                  <DetailField
                    id="country-region"
                    icon="map"
                    label="Región"
                    value={
                      viewState.country.subregion
                        ? `${viewState.country.region} (${viewState.country.subregion})`
                        : viewState.country.region
                    }
                  />
                  <DetailField
                    id="country-languages"
                    icon="translate"
                    label="Idiomas"
                    value={viewState.country.languages}
                  />
                  <DetailField
                    id="country-currency"
                    icon="payments"
                    label="Moneda"
                    value={viewState.country.currencies}
                  />
                  <DetailField
                    id="country-area"
                    icon="straighten"
                    label="Superficie"
                    value={viewState.country.areaFormatted}
                    mono={viewState.country.area !== null}
                    muted={viewState.country.area === null}
                  />
                  <DetailField
                    id="country-calling-code"
                    icon="call"
                    label="Código telefónico"
                    value={viewState.country.callingCode}
                    mono
                  />
                </dl>

                {/* Naciones constitutivas, territorios o regiones vinculadas al Estado soberano */}
                {viewState.country.relatedTerritories &&
                  viewState.country.relatedTerritories.length > 0 && (
                    <div className="pt-gutter-md border-t border-light-outline-variant/60 flex flex-col gap-gutter-xs">
                      <span className="font-label text-label-md text-light-on-surface-variant">
                        Naciones constitutivas, territorios o regiones asociados:
                      </span>
                      <div className="flex flex-wrap gap-gutter-xs">
                        {viewState.country.relatedTerritories.map((rel) => (
                          <button
                            key={rel.code}
                            type="button"
                            onClick={() => void executeSelectCountryByCode(rel.code, rel.name)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-DEFAULT border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container text-light-on-surface font-label text-label-md transition-colors duration-state-change focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-primary"
                          >
                            <span>{rel.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </article>
        </div>
      </main>
    </div>
  );
}
