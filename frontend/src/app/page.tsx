"use client";

import { useState } from "react";
import { usePoolData } from "@/hooks/usePoolData";
import ControlsBar from "@/components/ControlsBar";
import PoolTable from "@/components/PoolTable";

export default function Home() {
  const [timeframe, setTimeframe] = useState(30);
  const [selectedNetworks, setSelectedNetworks] = useState(["ethereum"]);
  const [hideFiltered, setHideFiltered] = useState(true);
  const { pools, loading, error } = usePoolData(timeframe, selectedNetworks);

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

        {!loading && !error && (
          <PoolTable pools={pools} hideFiltered={hideFiltered} />
        )}
      </div>
    </section>
  );
}
