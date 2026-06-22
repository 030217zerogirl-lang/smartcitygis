import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { divIcon } from "leaflet";

const DEFAULT_CENTER = [37.47, 126.93];
const DEFAULT_ZOOM = 10;
const VIEW_OPTIONS = ["compare", "pangyo", "cheongna"];
const TIME_OPTIONS = [30, 60];

const VWORLD_KEY = import.meta.env.VITE_VWORLD_KEY?.trim();
const TILE_SOURCE = VWORLD_KEY
  ? {
      attribution: '&copy; <a href="https://www.vworld.kr/">VWorld</a>',
      url: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png`,
    }
  : {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    };

const REGION_META = {
  pangyo: {
    id: "pangyo",
    name: "판교테크노밸리",
    shortName: "판교",
    color: "#0b5d7a",
    fill: "#55b6d8",
    center: [37.398, 127.111],
    zoom: 13,
  },
  cheongna: {
    id: "cheongna",
    name: "청라국제업무지구",
    shortName: "청라",
    color: "#1c7c54",
    fill: "#74c69d",
    center: [37.535, 126.646],
    zoom: 13,
  },
};

const LANDUSE_META = {
  residential: { key: "residential", label: "주거지역", color: "#f4a261" },
  commercial: { key: "commercial", label: "상업지역", color: "#e76f51" },
  industrial: { key: "industrial", label: "공업지역", color: "#577590" },
  green: { key: "green", label: "녹지지역", color: "#2a9d8f" },
  other: { key: "other", label: "기타", color: "#8d99ae" },
};

function App() {
  const [activeView, setActiveView] = useState("compare");
  const [selectedMinutes, setSelectedMinutes] = useState(30);
  const [dataState, setDataState] = useState({
    boundaries: [],
    regionStats: null,
    transit: null,
    buildingStats: null,
    landuseStats: null,
    censusLayers: {},
    landuseLayers: {},
    loading: true,
    error: "",
  });

  useEffect(() => {
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/analysis-boundaries.geojson`).then((res) => res.json()),
      fetch(`${import.meta.env.BASE_URL}data/region_stats.json`).then((res) => res.json()),
      fetch(`${import.meta.env.BASE_URL}data/transit_reachability.json`).then((res) => res.json()),
      fetch(`${import.meta.env.BASE_URL}data/building_stats.json`).then((res) => res.json()),
      fetch(`${import.meta.env.BASE_URL}data/landuse_stats.json`).then((res) => res.json()),
      fetch(`${import.meta.env.BASE_URL}data/pangyo_census_clip.geojson`).then((res) => res.json()),
      fetch(`${import.meta.env.BASE_URL}data/cheongna_census_clip.geojson`).then((res) => res.json()),
      fetch(`${import.meta.env.BASE_URL}data/pangyo_landuse.geojson`).then((res) => res.json()),
      fetch(`${import.meta.env.BASE_URL}data/cheongna_landuse.geojson`).then((res) => res.json()),
    ])
      .then(
        ([
          boundaryGeojson,
          regionStats,
          transit,
          buildingStats,
          landuseStats,
          pangyoCensus,
          cheongnaCensus,
          pangyoLanduse,
          cheongnaLanduse,
        ]) => {
          setDataState({
            boundaries: boundaryGeojson.features ?? [],
            regionStats,
            transit,
            buildingStats,
            landuseStats,
            censusLayers: { pangyo: pangyoCensus, cheongna: cheongnaCensus },
            landuseLayers: { pangyo: pangyoLanduse, cheongna: cheongnaLanduse },
            loading: false,
            error: "",
          });
        },
      )
      .catch((error) => {
        setDataState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : "데이터 로딩 실패",
        }));
      });
  }, []);

  const regionBundle = useMemo(() => {
    return Object.fromEntries(
      Object.keys(REGION_META).map((regionId) => {
        const regionStats = dataState.regionStats?.[regionId]?.totals ?? {};
        const transitRegion = dataState.transit?.regions?.[regionId] ?? {};
        const buildingStats = dataState.buildingStats?.regions?.[regionId] ?? {};
        const landuseStats = normalizeLanduseRegion(dataState.landuseStats?.regions?.[regionId]);
        return [
          regionId,
          {
            regionId,
            meta: REGION_META[regionId],
            regionStats,
            transitRegion,
            buildingStats,
            landuseStats,
          },
        ];
      }),
    );
  }, [dataState]);

  const kpiCards = useMemo(
    () => [
      makeKpi("총인구", regionBundle.pangyo.regionStats.population, regionBundle.cheongna.regionStats.population, "number"),
      makeKpi("총종사자수", regionBundle.pangyo.regionStats.workers, regionBundle.cheongna.regionStats.workers, "number"),
      makeKpi("직주비", regionBundle.pangyo.regionStats.jobsHousingRatio, regionBundle.cheongna.regionStats.jobsHousingRatio, "ratio"),
      makeKpi(
        "30분 도달가능 종사자",
        regionBundle.pangyo.transitRegion.timeBuckets?.[30]?.reachableWorkers,
        regionBundle.cheongna.transitRegion.timeBuckets?.[30]?.reachableWorkers,
        "number",
      ),
      makeKpi(
        "60분 도달가능 종사자",
        regionBundle.pangyo.transitRegion.timeBuckets?.[60]?.reachableWorkers,
        regionBundle.cheongna.transitRegion.timeBuckets?.[60]?.reachableWorkers,
        "number",
      ),
    ],
    [regionBundle],
  );

  const comparisonRows = useMemo(() => {
    const p = regionBundle.pangyo;
    const c = regionBundle.cheongna;
    return [
      rowMetric("총인구", p.regionStats.population, c.regionStats.population),
      rowMetric("총가구수", p.regionStats.household, c.regionStats.household),
      rowMetric("총종사자수", p.regionStats.workers, c.regionStats.workers),
      rowMetric("직주비", p.regionStats.jobsHousingRatio, c.regionStats.jobsHousingRatio, "ratio"),
      rowMetric("30분 접근 가능 인구", p.transitRegion.timeBuckets?.[30]?.reachablePopulation, c.transitRegion.timeBuckets?.[30]?.reachablePopulation),
      rowMetric("30분 접근 가능 종사자", p.transitRegion.timeBuckets?.[30]?.reachableWorkers, c.transitRegion.timeBuckets?.[30]?.reachableWorkers),
      rowMetric("60분 접근 가능 인구", p.transitRegion.timeBuckets?.[60]?.reachablePopulation, c.transitRegion.timeBuckets?.[60]?.reachablePopulation),
      rowMetric("60분 접근 가능 종사자", p.transitRegion.timeBuckets?.[60]?.reachableWorkers, c.transitRegion.timeBuckets?.[60]?.reachableWorkers),
      rowMetric("건축물 수", p.buildingStats.matchedBuildingCount, c.buildingStats.matchedBuildingCount),
      rowMetric("평균 용적률", p.buildingStats.averageFar, c.buildingStats.averageFar, "percent"),
      rowMetric("총 연면적", p.buildingStats.totalFloorAreaSum, c.buildingStats.totalFloorAreaSum),
      rowMetric("주거지역 비율", getCategoryRatio(p.landuseStats, "residential"), getCategoryRatio(c.landuseStats, "residential"), "percent"),
      rowMetric("상업지역 비율", getCategoryRatio(p.landuseStats, "commercial"), getCategoryRatio(c.landuseStats, "commercial"), "percent"),
      rowMetric("공업지역 비율", getCategoryRatio(p.landuseStats, "industrial"), getCategoryRatio(c.landuseStats, "industrial"), "percent"),
      rowMetric("녹지지역 비율", getCategoryRatio(p.landuseStats, "green"), getCategoryRatio(c.landuseStats, "green"), "percent"),
      rowMetric("LUM", p.landuseStats?.lum, c.landuseStats?.lum, "decimal3"),
    ];
  }, [regionBundle]);

  const chartRows = useMemo(() => {
    const p = regionBundle.pangyo;
    const c = regionBundle.cheongna;
    return {
      landuse: Object.values(LANDUSE_META).map((category) => ({
        label: category.label,
        pangyo: getCategoryRatio(p.landuseStats, category.key) ?? 0,
        cheongna: getCategoryRatio(c.landuseStats, category.key) ?? 0,
        formatter: (value) => `${formatDecimal(value, 2)}%`,
      })),
      lum: [
        {
          label: "LUM",
          pangyo: p.landuseStats?.lum ?? 0,
          cheongna: c.landuseStats?.lum ?? 0,
          max: 1,
          formatter: (value) => formatDecimal(value, 3),
        },
      ],
      jobsHousing: [
        {
          label: "직주비",
          pangyo: p.regionStats.jobsHousingRatio ?? 0,
          cheongna: c.regionStats.jobsHousingRatio ?? 0,
          formatter: (value) => `${formatDecimal(value, 1)}배`,
        },
      ],
      workersReach: TIME_OPTIONS.map((minutes) => ({
        label: `${minutes}분 도달가능 종사자`,
        pangyo: p.transitRegion.timeBuckets?.[minutes]?.reachableWorkers ?? 0,
        cheongna: c.transitRegion.timeBuckets?.[minutes]?.reachableWorkers ?? 0,
        formatter: (value) => formatNullableNumber(value),
      })),
    };
  }, [regionBundle]);

  if (dataState.loading) return <div className="loading-shell">실제 데이터를 불러오는 중입니다.</div>;
  if (dataState.error) return <div className="loading-shell">데이터 로딩 실패: {dataState.error}</div>;

  return (
    <div className="app-shell">
      <header className="topbar panel">
        <div>
          <p className="eyebrow">Pangyo vs Cheongna</p>
          <h1>데이터로 진단하는 업무지구의 성공과 실패</h1>
          <p className="subtitle">판교테크노밸리 vs 청라국제업무지구</p>
        </div>
        <div className="toolbar-stack">
          <nav className="view-switcher">
            {VIEW_OPTIONS.map((view) => (
              <button
                key={view}
                type="button"
                className={activeView === view ? "active" : ""}
                onClick={() => setActiveView(view)}
              >
                {view === "compare" ? "Split Map" : `${REGION_META[view].shortName} 보기`}
              </button>
            ))}
          </nav>
          <div className="time-options">
            {TIME_OPTIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={selectedMinutes === minutes ? "active" : ""}
                onClick={() => setSelectedMinutes(minutes)}
              >
                {minutes}분 접근성
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="kpi-grid">
        {kpiCards.map((card) => (
          <article key={card.title} className="kpi-card panel">
            <p className="kpi-title">{card.title}</p>
            <div className="kpi-values">
              <div className={`kpi-value ${card.winner === "pangyo" ? "winner pangyo" : ""}`}>
                <span>판교</span>
                <strong>{formatMetricValue(card.pangyo, card.type)}</strong>
              </div>
              <div className={`kpi-value ${card.winner === "cheongna" ? "winner cheongna" : ""}`}>
                <span>청라</span>
                <strong>{formatMetricValue(card.cheongna, card.type)}</strong>
              </div>
            </div>
          </article>
        ))}
      </section>

      <main className="page-grid">
        <section className="data-column">
          <section className="panel section-panel">
            <div className="section-head">
              <h2>핵심 비교표</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>지표</th>
                  <th>판교</th>
                  <th>청라</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className={getWinningRegion(row.pangyo, row.cheongna) === "pangyo" ? "cell-winner pangyo" : ""}>
                      {formatMetricValue(row.pangyo, row.type)}
                    </td>
                    <td className={getWinningRegion(row.pangyo, row.cheongna) === "cheongna" ? "cell-winner cheongna" : ""}>
                      {formatMetricValue(row.cheongna, row.type)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="chart-grid">
            <ChartCard title="용도지역 구성비">
              <GroupedBarChart rows={chartRows.landuse} />
            </ChartCard>
            <ChartCard title="LUM">
              <GroupedBarChart rows={chartRows.lum} />
            </ChartCard>
            <ChartCard title="직주비">
              <GroupedBarChart rows={chartRows.jobsHousing} />
            </ChartCard>
            <ChartCard title="30분/60분 도달가능 종사자">
              <GroupedBarChart rows={chartRows.workersReach} />
            </ChartCard>
          </section>
        </section>

        <section className="map-column panel">
          <div className="section-head">
            <h2>{activeView === "compare" ? "지도 비교" : "지도"}</h2>
          </div>

          {activeView === "compare" ? (
            <div className="split-map-grid">
              {["pangyo", "cheongna"].map((regionId) => (
                <article key={regionId} className="split-map-card">
                  <div className="split-map-head">
                    <h3>{REGION_META[regionId].name}</h3>
                    <span>{selectedMinutes}분 접근성</span>
                  </div>
                  <div className="split-map-frame">
                    <RegionMap
                      regionId={regionId}
                      boundaries={dataState.boundaries}
                      censusLayer={dataState.censusLayers[regionId]}
                      landuseLayer={dataState.landuseLayers[regionId]}
                      regionStats={dataState.regionStats}
                      transit={dataState.transit}
                      selectedMinutes={selectedMinutes}
                      independent={true}
                    />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="single-map-frame">
              <RegionMap
                regionId={activeView}
                boundaries={dataState.boundaries}
                censusLayer={dataState.censusLayers[activeView]}
                landuseLayer={dataState.landuseLayers[activeView]}
                regionStats={dataState.regionStats}
                transit={dataState.transit}
                selectedMinutes={selectedMinutes}
                independent={false}
              />
            </div>
          )}

          <div className="legend-rowset">
            <div className="legend-group compact">
              <strong>접근성</strong>
              <div className="legend-row">
                <span className={`legend-dot ${selectedMinutes === 30 ? "legend-dot-30" : "legend-dot-60"}`} />
                <span>{selectedMinutes}분 도달 가능 역</span>
              </div>
              <div className="legend-row">
                <span className="legend-dot key-dot" />
                <span>분석 기준역</span>
              </div>
            </div>
            <div className="legend-group compact">
              <strong>용도지역</strong>
              {Object.values(LANDUSE_META).map((category) => (
                <div key={category.key} className="legend-row">
                  <span className="legend-swatch" style={{ background: category.color }} />
                  <span>{category.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function RegionMap({ regionId, boundaries, censusLayer, landuseLayer, regionStats, transit, selectedMinutes, independent }) {
  const boundaryFeature = filterBoundaryFeature(boundaries, regionId);
  const [focusToken, setFocusToken] = useState(0);

  return (
    <div className="map-shell">
      <MapContainer
        center={REGION_META[regionId].center}
        zoom={REGION_META[regionId].zoom}
        className="map-container"
        zoomControl={true}
      >
        <TileLayer attribution={TILE_SOURCE.attribution} url={TILE_SOURCE.url} />
        <InitialBounds regionId={regionId} boundaries={boundaries} />
        <FitToRegionTrigger regionId={regionId} boundaries={boundaries} focusToken={focusToken} />

        <GeoJSON
          data={censusLayer}
          style={{
            color: REGION_META[regionId].color,
            weight: 0.45,
            fillColor: REGION_META[regionId].fill,
            fillOpacity: 0.06,
          }}
        />

        <GeoJSON
          data={landuseLayer}
          style={(feature) => {
            const category = LANDUSE_META[feature?.properties?.landuse_category] ?? LANDUSE_META.other;
            return {
              color: category.color,
              weight: 1,
              fillColor: category.color,
              fillOpacity: 0.32,
            };
          }}
        />

        <GeoJSON
          data={boundaryFeature}
          style={{
            color: REGION_META[regionId].color,
            weight: 3,
            fillColor: REGION_META[regionId].fill,
            fillOpacity: 0.02,
          }}
          onEachFeature={(feature, layer) => {
            const totals = regionStats?.[regionId]?.totals ?? {};
            layer.bindPopup(
              [
                `<strong>${feature.properties.name ?? REGION_META[regionId].name}</strong>`,
                `총인구: ${formatNullableNumber(totals.population)}`,
                `총종사자수: ${formatNullableNumber(totals.workers)}`,
                `직주비: ${formatMetricValue(totals.jobsHousingRatio, "ratio")}`,
              ].join("<br />"),
            );
          }}
        />

        <MapLabel center={REGION_META[regionId].center} text={REGION_META[regionId].shortName} onClick={() => setFocusToken((value) => value + 1)} />
        <KeyStationMarker regionId={regionId} transit={transit} />
        <TransitStationLayer regionId={regionId} transit={transit} minutes={selectedMinutes} />
      </MapContainer>
    </div>
  );
}

function InitialBounds({ regionId, boundaries }) {
  const map = useMap();

  useEffect(() => {
    fitRegionOnMap(map, regionId, boundaries);
  }, [map, regionId, boundaries]);

  return null;
}

function FitToRegionTrigger({ regionId, boundaries, focusToken }) {
  const map = useMap();

  useEffect(() => {
    if (!focusToken) return;
    fitRegionOnMap(map, regionId, boundaries);
  }, [map, regionId, boundaries, focusToken]);

  return null;
}

function MapLabel({ center, text, onClick }) {
  const icon = divIcon({
    className: "map-label-icon-wrapper",
    html: `<button type="button" class="map-label-chip">${text}</button>`,
    iconSize: [72, 28],
    iconAnchor: [36, 14],
  });

  return (
    <Marker
      position={center}
      icon={icon}
      eventHandlers={{
        click: () => onClick?.(),
      }}
    />
  );
}

function KeyStationMarker({ regionId, transit }) {
  const pool = [
    ...(transit?.regions?.[regionId]?.timeBuckets?.[30]?.reachableStationDetails ?? []),
    ...(transit?.regions?.[regionId]?.timeBuckets?.[60]?.reachableStationDetails ?? []),
  ];
  const keyStation = findKeyStation(regionId, pool);
  if (!keyStation) return null;

  const icon = divIcon({
    className: "key-station-icon-wrapper",
    html: `<div class="key-station-chip">${keyStation.label}</div>`,
    iconSize: [132, 34],
    iconAnchor: [66, 34],
  });

  return (
    <>
      <CircleMarker
        center={[keyStation.lat, keyStation.lng]}
        radius={10}
        pathOptions={{ color: "#101820", weight: 3, fillColor: "#ffd166", fillOpacity: 0.98 }}
      />
      <Marker position={[keyStation.lat, keyStation.lng]} icon={icon} interactive={false} />
    </>
  );
}

function TransitStationLayer({ regionId, transit, minutes }) {
  const stations = transit?.regions?.[regionId]?.timeBuckets?.[minutes]?.reachableStationDetails ?? [];
  const fillColor = minutes === 30 ? "#ff8c42" : "#9b5de5";
  const radius = minutes === 30 ? 4.8 : 6;
  const fillOpacity = minutes === 30 ? 0.95 : 0.42;

  return stations.map((station) => (
    <CircleMarker
      key={`${regionId}-${minutes}-${station.id}`}
      center={[station.lat, station.lng]}
      radius={radius}
      pathOptions={{ color: fillColor, weight: 1.8, fillColor, fillOpacity }}
    >
      <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
        <div>
          <strong>{station.name}</strong>
          <br />
          {station.line || "노선명 미표기"}
        </div>
      </Tooltip>
    </CircleMarker>
  ));
}

function ChartCard({ title, children }) {
  return (
    <section className="panel chart-card">
      <div className="section-head compact">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function GroupedBarChart({ rows }) {
  const globalMax = Math.max(...rows.map((row) => row.max ?? Math.max(row.pangyo ?? 0, row.cheongna ?? 0)), 1);

  return (
    <div className="grouped-chart">
      {rows.map((row) => {
        const scaleMax = row.max ?? globalMax;
        return (
          <div key={row.label} className="grouped-chart-row">
            <div className="grouped-chart-head">
              <strong>{row.label}</strong>
            </div>
            <div className="grouped-bar-line">
              <span className="bar-region-label">판교</span>
              <div className="bar-track">
                <div className="bar-value pangyo" style={{ width: `${((row.pangyo ?? 0) / scaleMax) * 100}%` }}>
                  {row.formatter(row.pangyo ?? 0)}
                </div>
              </div>
            </div>
            <div className="grouped-bar-line">
              <span className="bar-region-label">청라</span>
              <div className="bar-track">
                <div className="bar-value cheongna" style={{ width: `${((row.cheongna ?? 0) / scaleMax) * 100}%` }}>
                  {row.formatter(row.cheongna ?? 0)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function makeKpi(title, pangyo, cheongna, type) {
  return {
    title,
    pangyo,
    cheongna,
    type,
    winner: getWinningRegion(pangyo, cheongna),
  };
}

function rowMetric(label, pangyo, cheongna, type = "number") {
  return { label, pangyo, cheongna, type };
}

function normalizeLanduseRegion(region) {
  if (!region) return null;
  return {
    ...region,
    categories: Object.values(LANDUSE_META).map((category) => {
      const source = (region.categories ?? []).find((item) => item.key === category.key);
      return {
        ...category,
        areaSqm: source?.areaSqm ?? null,
        ratio: source?.ratio ?? null,
      };
    }),
  };
}

function getCategoryRatio(region, key) {
  return region?.categories?.find((item) => item.key === key)?.ratio ?? null;
}

function findKeyStation(regionId, details) {
  const unique = details.filter((station, index, array) => array.findIndex((item) => item.id === station.id) === index);
  if (regionId === "pangyo") {
    const station = unique.find((item) => normalizeText(item.name).includes("판교")) ?? unique[0];
    return station ? { ...station, label: "판교역" } : null;
  }
  const station =
    unique.find((item) => normalizeText(item.name).includes("청라")) ??
    unique.find((item) => normalizeText(item.name).includes("국제도시")) ??
    unique[0];
  return station ? { ...station, label: "청라 분석 기준역" } : null;
}

function normalizeText(value) {
  return String(value ?? "").replace(/\?/g, "").replace(/\s+/g, "");
}

function getWinningRegion(pangyo, cheongna) {
  if (pangyo === null || pangyo === undefined || cheongna === null || cheongna === undefined) return null;
  if (Number(pangyo) === Number(cheongna)) return null;
  return Number(pangyo) > Number(cheongna) ? "pangyo" : "cheongna";
}

function filterBoundaryFeature(features, regionId) {
  return { type: "FeatureCollection", features: features.filter((feature) => feature.properties?.id === regionId) };
}

function flattenBoundaryCoords(features) {
  const coords = [];
  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === "Polygon") geometry.coordinates.forEach((ring) => ring.forEach((coord) => coords.push(coord)));
    if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach((polygon) => polygon.forEach((ring) => ring.forEach((coord) => coords.push(coord))));
    }
  }
  return coords;
}

function fitRegionOnMap(map, regionId, boundaries) {
  const targetFeatures = boundaries.filter((feature) => feature.properties?.id === regionId);
  const bounds = flattenBoundaryCoords(targetFeatures).map(([lng, lat]) => [lat, lng]);
  if (bounds.length) {
    map.fitBounds(bounds, {
      padding: [36, 36],
      maxZoom: REGION_META[regionId].zoom,
    });
  } else {
    map.setView(REGION_META[regionId].center, REGION_META[regionId].zoom, { animate: false });
  }
}

function formatNumber(value, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits }).format(Number(value ?? 0));
}

function formatNullableNumber(value) {
  if (value === null || value === undefined) return "데이터 미연결";
  return formatNumber(value, Number.isInteger(Number(value)) ? 0 : 1);
}

function formatDecimal(value, digits = 3) {
  if (value === null || value === undefined) return "데이터 미연결";
  return Number(value).toFixed(digits);
}

function formatMetricValue(value, type = "number") {
  if (value === null || value === undefined) return "데이터 미연결";
  if (type === "ratio") return `${formatNumber(value, 1)}배`;
  if (type === "percent") return `${formatNumber(value, 2)}%`;
  if (type === "decimal3") return formatDecimal(value, 3);
  return formatNullableNumber(value);
}

export default App;
