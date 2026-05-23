import { useEffect, useMemo, useRef, useState } from 'react';

export interface SelectOption<V extends string | number = string> {
  value: V;
  label: string;
  description?: string;
}

interface SelectProps<V extends string | number = string> {
  value: V | null | undefined;
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  emptyText?: string;
  id?: string;
  name?: string;
}

export default function Select<V extends string | number = string>({
  value,
  options,
  onChange,
  placeholder = 'Выберите…',
  searchable = false,
  disabled = false,
  invalid = false,
  emptyText = 'Ничего не найдено',
  id,
  name,
}: SelectProps<V>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchable) {
      setQuery('');
      setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [open, searchable]);

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.description?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query]);

  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <div className="select-wrap" ref={wrapRef}>
      <button
        type="button"
        id={id}
        name={name}
        className={`select-trigger${invalid ? ' is-invalid' : ''}${open ? ' is-open' : ''}`}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? '' : 'muted'}>
          {selected ? selected.label : placeholder}
        </span>
        <i className="select-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="select-dropdown" role="listbox">
          {searchable && (
            <input
              ref={searchRef}
              className="select-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск…"
              autoComplete="off"
            />
          )}
          <div className="select-options">
            {filtered.length === 0 ? (
              <div className="select-empty">{emptyText}</div>
            ) : (
              filtered.map((o) => (
                <div
                  key={String(o.value)}
                  role="option"
                  aria-selected={o.value === value}
                  className={`select-option${o.value === value ? ' is-selected' : ''}`}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span className="select-option-label">{o.label}</span>
                  {o.description && (
                    <span className="select-option-desc">{o.description}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
