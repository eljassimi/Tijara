"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export type CustomSelectOption = {
  value: string;
  label: string;
  /** Extra text matched by search (e.g. alternate language city names). */
  keywords?: string;
  disabled?: boolean;
};

type CustomSelectProps = {
  name: string;
  options: readonly CustomSelectOption[];
  label: string;
  locale: "fr" | "ar";
  defaultValue?: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  id?: string;
  className?: string;
  onValueChange?: (value: string) => void;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export function CustomSelect({
  name,
  options,
  label,
  locale,
  defaultValue = "",
  value,
  placeholder,
  required,
  disabled,
  invalid,
  searchable,
  searchPlaceholder,
  emptyMessage,
  id,
  className = "",
  onValueChange,
}: CustomSelectProps) {
  const generatedId = useId();
  const selectId = id ?? `custom-select-${generatedId}`;
  const listboxId = `${selectId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [internalValue, setInternalValue] = useState(value ?? defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [nativeInvalid, setNativeInvalid] = useState(false);
  const selectedValue = value ?? internalValue;
  const selectedOption = options.find(
    (option) => option.value === selectedValue,
  );
  const showSearch = searchable ?? options.length > 8;
  const copy =
    locale === "ar"
      ? {
          choose: "اختر",
          search: "ابحث…",
          empty: "لا توجد نتائج",
        }
      : {
          choose: "Choisir",
          search: "Rechercher…",
          empty: "Aucun résultat",
        };

  const visibleOptions = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return options;
    return options.filter((option) => {
      const candidate = normalize(
        `${option.label} ${option.keywords ?? ""}`,
      );
      return terms.every((term) => candidate.includes(term));
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (showSearch) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, showSearch]);

  useEffect(() => {
    if (activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const moveActive = (direction: 1 | -1) => {
    if (!visibleOptions.length) return;
    let next = activeIndex;
    for (let checked = 0; checked < visibleOptions.length; checked += 1) {
      next = (next + direction + visibleOptions.length) % visibleOptions.length;
      if (!visibleOptions[next]?.disabled) {
        setActiveIndex(next);
        return;
      }
    }
  };

  const openMenu = () => {
    const selectedIndex = visibleOptions.findIndex(
      (option) => option.value === selectedValue && !option.disabled,
    );
    setActiveIndex(
      selectedIndex >= 0
        ? selectedIndex
        : visibleOptions.findIndex((option) => !option.disabled),
    );
    setOpen(true);
  };

  const choose = (option: CustomSelectOption) => {
    if (option.disabled) return;
    if (value === undefined) setInternalValue(option.value);
    onValueChange?.(option.value);
    setNativeInvalid(false);
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openMenu();
      else moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(visibleOptions.findIndex((option) => !option.disabled));
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      for (let index = visibleOptions.length - 1; index >= 0; index -= 1) {
        if (!visibleOptions[index]?.disabled) {
          setActiveIndex(index);
          break;
        }
      }
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && !open) {
      event.preventDefault();
      openMenu();
      return;
    }
    if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      const option = visibleOptions[activeIndex];
      if (option) choose(option);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`custom-select ${className}`.trim()}
      data-open={open || undefined}
      data-invalid={invalid || nativeInvalid || undefined}
    >
      <select
        className="custom-select__native"
        name={name}
        value={selectedValue}
        required={required}
        disabled={disabled}
        aria-label={label}
        aria-hidden="true"
        tabIndex={-1}
        onChange={() => undefined}
        onInvalid={(event) => {
          event.preventDefault();
          setNativeInvalid(true);
          openMenu();
          requestAnimationFrame(() => triggerRef.current?.focus());
        }}
      >
        <option value="">{placeholder ?? copy.choose}</option>
        {options
          .filter((option) => option.value !== "")
          .map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
      </select>
      <button
        ref={triggerRef}
        id={selectId}
        className="custom-select__trigger"
        type="button"
        role="combobox"
        aria-label={label}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={
          open && activeIndex >= 0
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
        aria-invalid={invalid || nativeInvalid || undefined}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
      >
        <span data-placeholder={!selectedOption || undefined}>
          {selectedOption?.label ?? placeholder ?? copy.choose}
        </span>
        <ChevronDown className="custom-select__chevron" size={17} />
      </button>
      {open && (
        <div className="custom-select__panel">
          {showSearch && (
            <label className="custom-select__search">
              <Search size={15} />
              <span className="sr-only">
                {searchPlaceholder ?? copy.search}
              </span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                aria-controls={listboxId}
                aria-activedescendant={
                  activeIndex >= 0
                    ? `${listboxId}-option-${activeIndex}`
                    : undefined
                }
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
              />
            </label>
          )}
          <div
            id={listboxId}
            className="custom-select__options"
            role="listbox"
            aria-label={label}
          >
            {visibleOptions.length ? (
              visibleOptions.map((option, index) => (
                <button
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  className="custom-select__option"
                  data-active={index === activeIndex || undefined}
                  aria-selected={option.value === selectedValue}
                  disabled={option.disabled}
                  key={option.value}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                >
                  <span>{option.label}</span>
                  {option.value === selectedValue && <Check size={16} />}
                </button>
              ))
            ) : (
              <p className="custom-select__empty">
                {emptyMessage ?? copy.empty}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
