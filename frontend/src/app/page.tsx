"use client";

import { useState } from "react";
import { usePoolData } from "@/hooks/usePoolData";
import ControlsBar from "@/components/ControlsBar";
import PoolTable from "@/components/PoolTable";
import { EXCHANGES } from "@/utils/constants";

export default function Home() {
  const [timeframe, setTimeframe] = useState(30);
  const [selectedNetworks, setSelectedNetworks] = useState(["ethereum"]);
  const [selectedExchanges, setSelectedExchanges] = useState<string[]>(EXCHANGES.map((e) => e.key));
  const [hideFiltered, setHideFiltered] = useState(true);
  const { pools, loading, error, sourceErrors } = usePoolData(timeframe, selectedNetworks, selectedExchanges);

  return (
    <section className="section">
      <div className="container is-fluid">
        <h1 className="title is-3">LP Discovery</h1>
        <p className="subtitle is-6 has-text-grey">
          Discover liquidity pool opportunities across DeFi
        </p>

        <ControlsBar
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          selectedNetworks={selectedNetworks}
          onNetworksChange={setSelectedNetworks}
          selectedExchanges={selectedExchanges}
          onExchangesChange={setSelectedExchanges}
          hideFiltered={hideFiltered}
          onHideFilteredChange={setHideFiltered}
        />

        {loading && (
          <div className="loading-overlay">
            <div className="has-text-centered">
              <p className="is-size-5">Loading pool data...</p>
              <progress className="progress is-small is-primary mt-3" max="100" />
            </div>
          </div>
        )}

        {error && (
          <div className="notification is-danger is-light">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* A source that failed is reported beside the rows that arrived,
            rather than hiding a table that is mostly fine */}
        {!loading && sourceErrors.length > 0 && (
          <div className="notification is-warning is-light py-2 px-4 is-size-7">
            <strong>Unavailable right now:</strong>{" "}
            {sourceErrors.map((e) => e.source).join(", ")} — the rest of the table is current.
          </div>
        )}

        {!loading && !error && (
          <PoolTable pools={pools} hideFiltered={hideFiltered} />
        )}
      </div>
    </section>
  );
}
