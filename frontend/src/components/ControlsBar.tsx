"use client";

import { useRef, useState, useEffect } from "react";
import { TIMEFRAMES, NETWORKS, EXCHANGES } from "@/utils/constants";

interface ControlsBarProps {
  timeframe: number;
  onTimeframeChange: (timeframe: number) => void;
  selectedNetworks: string[];
  onNetworksChange: (networks: string[]) => void;
  selectedExchanges: string[];
  onExchangesChange: (exchanges: string[]) => void;
  hideFiltered: boolean;
  onHideFilteredChange: (hide: boolean) => void;
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly { key: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleToggle(key: string) {
    if (selected.includes(key)) {
      if (selected.length > 1) {
        onChange(selected.filter((k) => k !== key));
      }
    } else {
      onChange([...selected, key]);
    }
  }

  // Seven exchange names joined is a paragraph, not a label
  const selectedLabels = selected.length === options.length
    ? `All ${label.toLowerCase()}s`
    : options
        .filter((o) => selected.includes(o.key))
        .map((o) => o.label)
        .join(", ");

  return (
    <div className="field">
      <label className="label is-small">{label}</label>
      <div className={`dropdown ${open ? "is-active" : ""}`} ref={ref}>
        <div className="dropdown-trigger">
          <button
            type="button"
            className="button is-small"
            onClick={() => setOpen(!open)}
            style={{ minWidth: "140px", justifyContent: "space-between" }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selectedLabels || "Select..."}
            </span>
            <span className="icon is-small">
              <span style={{ fontSize: "0.6rem" }}>{open ? "▲" : "▼"}</span>
            </span>
          </button>
        </div>
        <div className="dropdown-menu" role="menu" style={{ minWidth: "140px" }}>
          <div className="dropdown-content">
            {options.map((opt) => (
              <label
                key={opt.key}
                className="dropdown-item"
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.key)}
                  onChange={() => handleToggle(opt.key)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ControlsBar({
  timeframe,
  onTimeframeChange,
  selectedNetworks,
  onNetworksChange,
  selectedExchanges,
  onExchangesChange,
  hideFiltered,
  onHideFilteredChange,
}: ControlsBarProps) {
  return (
    <div className="controls-bar columns is-vcentered is-multiline">
      <div className="column is-narrow">
        <div className="field">
          <label className="label is-small">Opportunity Type</label>
          <div className="control">
            <div className="select is-small">
              <select disabled>
                <option>LP</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="column is-narrow">
        <MultiSelectDropdown
          label="Exchange"
          options={EXCHANGES}
          selected={selectedExchanges}
          onChange={onExchangesChange}
        />
      </div>

      <div className="column is-narrow">
        <MultiSelectDropdown
          label="Network"
          options={NETWORKS}
          selected={selectedNetworks}
          onChange={onNetworksChange}
        />
      </div>

      <div className="column is-narrow">
        <div className="field">
          <label className="label is-small">Timeframe</label>
          <div className="control">
            <div className="select is-small">
              <select
                value={timeframe}
                onChange={(e) => onTimeframeChange(parseInt(e.target.value, 10))}
              >
                {TIMEFRAMES.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf} days
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="column is-narrow">
        <div className="field">
          <label className="label is-small">&nbsp;</label>
          <div className="control">
            <label className="checkbox is-small">
              <input
                type="checkbox"
                checked={hideFiltered}
                onChange={(e) => onHideFilteredChange(e.target.checked)}
              />{" "}
              Hide unselected pools
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
