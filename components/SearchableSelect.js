// Client Component — uses useState, useEffect, and useRef for interactive behavior.
"use client";

import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// SearchableSelect
//
// A controlled dropdown replacement with live text filtering.
//
// Props:
//   options      — [{ value, label }] — the list of selectable items
//   value        — currently selected value (controlled)
//   onChange     — (value: string) => void — called when a real option is picked or cleared
//   placeholder  — string shown when nothing is selected
//   disabled     — grays out and disables interaction
//   allowCreate  — when true, shows a sentinel "create" option at the bottom
//   onCreateNew  — () => void — called when the sentinel option is clicked
//   createLabel  — label text for the sentinel option
// ─────────────────────────────────────────────────────────────────────────────

export default function SearchableSelect({
  options      = [],
  value        = "",
  onChange,
  placeholder  = "Select...",
  disabled     = false,
  allowCreate  = false,
  onCreateNew,
  createLabel  = "+ Create new",
}) {
  const [isOpen,     setIsOpen]     = useState(false);
  const [searchText, setSearchText] = useState("");
  const wrapperRef = useRef(null);

  // ── Outside click detection ──────────────────────────────────────────────
  // Attach a mousedown listener to the document. When the click target is
  // outside our wrapper div, close the panel and reset search text.
  // We use mousedown (not click) so the listener fires before any blur event,
  // ensuring option clicks register before the panel disappears.
  // The cleanup function removes the listener when the component unmounts,
  // preventing memory leaks from stale listeners.
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchText("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Derive what to show in the closed state from the current value.
  const selectedOption = options.find((o) => o.value === value);
  const displayLabel   = selectedOption ? selectedOption.label : "";

  // Filter options as the user types — case-insensitive, matches anywhere.
  const filteredOptions = options.filter((o) =>
    o.label.toLowerCase().includes(searchText.toLowerCase())
  );

  // Opens the panel and clears the search input for fresh filtering.
  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    setSearchText("");
  };

  // Selects an option, notifies the parent, and closes the panel.
  const handleSelect = (optValue) => {
    onChange(optValue);
    setIsOpen(false);
    setSearchText("");
  };

  // Clears the current selection without opening the panel.
  // stopPropagation keeps the wrapper's onClick from reopening the panel.
  const handleClear = (e) => {
    e.stopPropagation();
    onChange("");
    setIsOpen(false);
    setSearchText("");
  };

  // Closes the panel on Escape without changing the current selection.
  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setSearchText("");
    }
  };

  return (
    <div ref={wrapperRef} className="relative">

      {isOpen ? (
        // ── Search input — visible while the panel is open ────────────────
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type to search..."
          autoFocus
          className="w-full rounded-md border border-amber-400 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 outline-none ring-2 ring-amber-400"
        />
      ) : (
        // ── Display trigger — shows selected label or placeholder ──────────
        <div
          onClick={handleOpen}
          className={`w-full rounded-md border px-3 py-2 text-sm flex items-center justify-between select-none ${
            disabled
              ? "bg-stone-50 border-stone-200 text-stone-400 cursor-not-allowed"
              : "bg-white border-stone-300 text-stone-800 hover:border-stone-400 cursor-pointer"
          }`}
        >
          <span className={displayLabel ? "text-stone-800" : "text-stone-400"}>
            {displayLabel || placeholder}
          </span>
          <div className="flex items-center gap-0.5 shrink-0 ml-2">
            {/* Clear button — only shown when a value is selected */}
            {value && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear selection"
                className="text-stone-400 hover:text-stone-600 leading-none px-0.5"
              >
                ×
              </button>
            )}
            {/* Chevron */}
            <svg className="h-4 w-4 text-stone-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      )}

      {/* ── Dropdown panel — rendered below the trigger ───────────────────── */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-stone-200 bg-white shadow-lg max-h-48 overflow-y-auto">

          {/* Real options — filtered by search text */}
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                // onMouseDown + preventDefault keeps the input from blurring
                // before the click registers on this button.
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(option.value);
                }}
                className={`block w-full text-left px-3 py-2 text-sm transition-colors hover:bg-stone-50 ${
                  option.value === value
                    ? "text-amber-700 font-medium bg-amber-50"
                    : "text-stone-700"
                }`}
              >
                {option.label}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-stone-400">No matches found.</p>
          )}

          {/* Sentinel "create new" option — always visible when allowCreate */}
          {allowCreate && (
            <div className="border-t border-stone-100">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsOpen(false);
                  setSearchText("");
                  onCreateNew?.();
                }}
                className="block w-full text-left px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors"
              >
                {createLabel}
              </button>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
