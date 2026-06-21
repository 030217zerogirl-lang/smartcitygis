import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";

const DEFAULT_CENTER = [37.47, 126.93];
const DEFAULT_ZOOM = 10;
const TIME_OPTIONS = [10, 20, 30, 40, 50, 60];
const REGION_ORDER = ["pangyo", "cheongna"];
const ISOCHRONE_VIEWS = [30, 60];

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
    center: [37.3947, 127.1112],
  },
  cheongna: {
    id: "cheongna",
    name: "청라국제업무지구",
    shortName: "청라",
    color: "#1c7c54",
    fill: "#74c69d",
    center: [37.5335, 126.646],
  },
};

const LANDUSE_META = {
  residential: { key: "residential", label: "주거지역", color: "#f4a261" },
  commercial: { key: "commercial", label: "상업지역", color: "#e76f51" },
  industrial: { key: "industrial", label: "공업지역", color: "#577590" },
  green: { key: "green", label: "녹지지역", color: "#2a9d8f" },
  other: { key: "other", label: "기타", color: "#8d99ae" },
};

const ANALYSIS_NOTE =
  "본 연구는 공식 사업구역 SHP를 확보하지 못했기 때문에, 판교테크노밸리와 청라국제업무지구의 중심 업무권역을 기준으로 분석권역을 정의하였다. 해당 경계는 법적 경계가 아니라 비교분석을 위한 분석 단위이며, 모든 수치는 이 분석권역 기준으로 산출하였다.";

const INTERPRETATION_NOTE =
  "토지이용 혼합도는 청라가 판교보다 높게 나타났으나, 판교는 직주비와 철도 접근성, 도달가능 종사자 규모에서 청라보다 우세하게 나타났다. 따라서 본 분석에서는 업무지구 성과 차이를 단순한 토지이용 혼합도보다 접근성 및 고용집적 수준의 차이로 해석한다.";

const ANALYSIS_INFO = [
  { label: "기준연도", value: "2024" },
  { label: "분석단위", value: "집계구" },
  { label: "비교지역", value: "판교테크노밸리, 청라국제업무지구" },
  { label: "분석주제", value: "접근성이 높을수록 업무지구는 성공한다" },
];

function App() {
  const [activeView, setActiveView] = useState("compare");
  const [selectedMinutes, setSelectedMinutes] = useState(30);
  const [syncedView, setSyncedView] = useState({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
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
            censusLayers: {
              pangyo: pangyoCensus,
              cheongna: cheongnaCensus,
            },
            landuseLayers: {
              pangyo: pangyoLanduse,
              cheongna: cheongnaLanduse,
            },
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

  const activeRegionIds = activeView === "compare" ? REGION_ORDER : [activeView];

  const regionBundle = useMemo(() => {
    return Object.fromEntries(
      REGION_ORDER.map((regionId) => {
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
  }, [dataState.regionStats, dataState.transit, dataState.buildingStats, dataState.landuseStats]);

  const summaryCards = useMemo(() => {
    return activeRegionIds.map((regionId) => {
      const bundle = regionBundle[regionId];
      const bucket = bundle.transitRegion?.timeBuckets?.[selectedMinutes];

      return {
        regionId,
        title: bundle.meta.name,
        population: bundle.regionStats.population ?? null,
        household: bundle.regionStats.household ?? null,
        workers: bundle.regionStats.workers ?? null,
        jobsHousingRatio: bundle.regionStats.jobsHousingRatio ?? null,
        reachablePopulation: bucket?.reachablePopulation ?? null,
        reachableWorkers: bucket?.reachableWorkers ?? null,
        reachableStationCount: bucket?.reachableStationCount ?? null,
      };
    });
  }, [activeRegionIds, regionBundle, selectedMinutes]);

  const comparisonTableRows = useMemo(() => {
    const pangyo = regionBundle.pangyo;
    const cheongna = regionBundle.cheongna;

    return [
      rowMetric("총인구", pangyo.regionStats.population, cheongna.regionStats.population),
      rowMetric("총가구수", pangyo.regionStats.household, cheongna.regionStats.household),
      rowMetric("총종사자수", pangyo.regionStats.workers, cheongna.regionStats.workers),
      rowMetric("직주비", pangyo.regionStats.jobsHousingRatio, cheongna.regionStats.jobsHousingRatio, "ratio"),
      rowMetric("30분 접근 가능 인구", pangyo.transitRegion.timeBuckets?.[30]?.reachablePopulation, cheongna.transitRegion.timeBuckets?.[30]?.reachablePopulation),
      rowMetric("30분 접근 가능 종사자", pangyo.transitRegion.timeBuckets?.[30]?.reachableWorkers, cheongna.transitRegion.timeBuckets?.[30]?.reachableWorkers),
      rowMetric("60분 접근 가능 인구", pangyo.transitRegion.timeBuckets?.[60]?.reachablePopulation, cheongna.transitRegion.timeBuckets?.[60]?.reachablePopulation),
      rowMetric("60분 접근 가능 종사자", pangyo.transitRegion.timeBuckets?.[60]?.reachableWorkers, cheongna.transitRegion.timeBuckets?.[60]?.reachableWorkers),
      rowMetric("건축물 수", pangyo.buildingStats.matchedBuildingCount, cheongna.buildingStats.matchedBuildingCount),
      rowMetric("평균 용적률", pangyo.buildingStats.averageFar, cheongna.buildingStats.averageFar, "percent"),
      rowMetric("총 연면적", pangyo.buildingStats.totalFloorAreaSum, cheongna.buildingStats.totalFloorAreaSum),
      rowMetric("주거지역 비율", getCategoryRatio(pangyo.landuseStats, "residential"), getCategoryRatio(cheongna.landuseStats, "residential"), "percent"),
      rowMetric("상업지역 비율", getCategoryRatio(pangyo.landuseStats, "commercial"), getCategoryRatio(cheongna.landuseStats, "commercial"), "percent"),
      rowMetric("공업지역 비율", getCategoryRatio(pangyo.landuseStats, "industrial"), getCategoryRatio(cheongna.landuseStats, "industrial"), "percent"),
      rowMetric("녹지지역 비율", getCategoryRatio(pangyo.landuseStats, "green"), getCategoryRatio(cheongna.landuseStats, "green"), "percent"),
      rowMetric("LUM", pangyo.landuseStats?.lum, cheongna.landuseStats?.lum, "decimal3"),
    ];
  }, [regionBundle]);

  const landuseChartRows = useMemo(
    () =>
      Object.values(LANDUSE_META).map((category) => ({
        key: category.key,
        label: category.label,
        color: category.color,
        pangyo: getCategoryRatio(regionBundle.pangyo.landuseStats, category.key) ?? 0,
        cheongna: getCategoryRatio(regionBundle.cheongna.landuseStats, category.key) ?? 0,
      })),
    [regionBundle],
  );

  const lumChartRows = useMemo(
    () => [
      {
        label: "LUM",
        pangyo: regionBundle.pangyo.landuseStats?.lum ?? 0,
        cheongna: regionBundle.cheongna.landuseStats?.lum ?? 0,
        max: 1,
        formatter: (value) => formatDecimal(value, 3),
      },
    ],
    [regionBundle],
  );

  const jobsHousingChartRows = useMemo(
    () => [
      {
        label: "직주비",
        pangyo: regionBundle.pangyo.regionStats.jobsHousingRatio ?? 0,
        cheongna: regionBundle.cheongna.regionStats.jobsHousingRatio ?? 0,
        max: Math.max(regionBundle.pangyo.regionStats.jobsHousingRatio ?? 0, regionBundle.cheongna.regionStats.jobsHousingRatio ?? 0, 1),
        formatter: (value) => `${formatDecimal(value, 1)}배`,
      },
    ],
    [regionBundle],
  );

  const reachableWorkersChartRows = useMemo(
    () =>
      ISOCHRONE_VIEWS.map((minutes) => ({
        label: `${minutes}분 도달 가능 종사자`,
        pangyo: regionBundle.pangyo.transitRegion.timeBuckets?.[minutes]?.reachableWorkers ?? 0,
        cheongna: regionBundle.cheongna.transitRegion.timeBuckets?.[minutes]?.reachableWorkers ?? 0,
        formatter: (value) => formatNullableNumber(value),
      })),
    [regionBundle],
  );

  const buildingPanels = useMemo(
    () =>
      activeRegionIds.map((regionId) => {
        const bundle = regionBundle[regionId];
        const totalFloorArea = bundle.buildingStats.totalFloorAreaSum ?? 0;
        const topByCount = [...(bundle.buildingStats.topUses ?? [])].sort((a, b) => b.buildingCount - a.buildingCount).slice(0, 5);
        const topByFloorShare = [...(bundle.buildingStats.topUses ?? [])]
          .slice(0, 5)
          .map((item) => ({
            ...item,
            floorAreaShare: totalFloorArea > 0 ? (item.floorAreaSum / totalFloorArea) * 100 : null,
          }));

        return {
          regionId,
          region: bundle.meta,
          stats: bundle.buildingStats,
          topByCount,
          topByFloorShare,
        };
      }),
    [activeRegionIds, regionBundle],
  );

  const kpiCards = useMemo(
    () => [
      {
        key: "jobsHousingRatio",
        title: "직주비",
        pangyo: regionBundle.pangyo.regionStats.jobsHousingRatio,
        cheongna: regionBundle.cheongna.regionStats.jobsHousingRatio,
        type: "ratio",
        winner: "higher",
      },
      {
        key: "workers30",
        title: "30분 도달가능 종사자",
        pangyo: regionBundle.pangyo.transitRegion.timeBuckets?.[30]?.reachableWorkers,
        cheongna: regionBundle.cheongna.transitRegion.timeBuckets?.[30]?.reachableWorkers,
        type: "number",
        winner: "higher",
      },
      {
        key: "workers60",
        title: "60분 도달가능 종사자",
        pangyo: regionBundle.pangyo.transitRegion.timeBuckets?.[60]?.reachableWorkers,
        cheongna: regionBundle.cheongna.transitRegion.timeBuckets?.[60]?.reachableWorkers,
        type: "number",
        winner: "higher",
      },
      {
        key: "lum",
        title: "LUM",
        pangyo: regionBundle.pangyo.landuseStats?.lum,
        cheongna: regionBundle.cheongna.landuseStats?.lum,
        type: "decimal3",
        winner: "higher",
      },
    ],
    [regionBundle],
  );

  if (dataState.loading) {
    return <div className="loading-shell">실제 데이터를 불러오는 중입니다.</div>;
  }

  if (dataState.error) {
    return <div className="loading-shell">데이터 로딩 실패: {dataState.error}</div>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-copy">
          <p className="eyebrow">Real Data Only</p>
          <h1>데이터로 진단하는 업무지구의 성공과 실패</h1>
          <p className="subtitle">판교테크노밸리 vs 청라국제업무지구</p>
          <p className="topbar-note">{ANALYSIS_NOTE}</p>
        </div>

        <div className="toolbar-stack">
          <nav className="view-switcher">
            <button type="button" className={activeView === "pangyo" ? "active" : ""} onClick={() => setActiveView("pangyo")}>
              판교 보기
            </button>
            <button type="button" className={activeView === "cheongna" ? "active" : ""} onClick={() => setActiveView("cheongna")}>
              청라 보기
            </button>
            <button type="button" className={activeView === "compare" ? "active" : ""} onClick={() => setActiveView("compare")}>
              Split Map
            </button>
          </nav>

          <section className="time-panel">
            <div className="time-panel-head">
              <strong>접근성 기준 시간</strong>
              <span>{selectedMinutes}분</span>
            </div>
            <div className="time-options">
              {TIME_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className={selectedMinutes === minutes ? "active" : ""}
                  onClick={() => setSelectedMinutes(minutes)}
                >
                  {minutes}분
                </button>
              ))}
            </div>
          </section>
        </div>
      </header>

      <section className="summary-grid">
        {summaryCards.map((card) => (
          <article key={card.regionId} className="summary-card">
            <p className="summary-label">{card.title}</p>
            <div className="summary-metric">
              <span>총인구</span>
              <strong>{formatNullableNumber(card.population)}</strong>
            </div>
            <div className="summary-metric">
              <span>총가구수</span>
              <strong>{formatNullableNumber(card.household)}</strong>
            </div>
            <div className="summary-metric">
              <span>총종사자수</span>
              <strong>{formatNullableNumber(card.workers)}</strong>
            </div>
            <div className="summary-metric">
              <span>직주비</span>
              <strong>{formatMetricValue(card.jobsHousingRatio, "ratio")}</strong>
            </div>
            <div className="summary-metric emphasis">
              <span>{selectedMinutes}분 접근 가능 인구</span>
              <strong>{formatNullableNumber(card.reachablePopulation)}</strong>
            </div>
            <div className="summary-metric emphasis">
              <span>{selectedMinutes}분 접근 가능 종사자</span>
              <strong>{formatNullableNumber(card.reachableWorkers)}</strong>
            </div>
            <div className="summary-metric">
              <span>{selectedMinutes}분 도달 가능 역</span>
              <strong>{formatNullableNumber(card.reachableStationCount)}</strong>
            </div>
          </article>
        ))}
      </section>

      <section className="kpi-grid">
        {kpiCards.map((card) => {
          const winner = getWinningRegion(card.pangyo, card.cheongna, card.winner);
          return (
            <article key={card.key} className="kpi-card panel">
              <p className="kpi-title">{card.title}</p>
              <div className="kpi-compare">
                <div className={`kpi-value-card ${winner === "pangyo" ? "winner pangyo" : ""}`}>
                  <span>판교</span>
                  <strong>{formatMetricValue(card.pangyo, card.type)}</strong>
                </div>
                <div className={`kpi-value-card ${winner === "cheongna" ? "winner cheongna" : ""}`}>
                  <span>청라</span>
                  <strong>{formatMetricValue(card.cheongna, card.type)}</strong>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <main className="content-grid">
        <section className="map-section panel">
          <div className="section-head">
            <h2>{activeView === "compare" ? "Split Map 비교" : "분석권역 지도"}</h2>
            <span>{activeView === "compare" ? "좌측 판교 / 우측 청라" : REGION_META[activeView].name}</span>
          </div>

          {activeView === "compare" ? (
            <div className="split-map-grid">
              {REGION_ORDER.map((regionId) => (
                <article key={regionId} className="split-map-card">
                  <div className="split-map-head">
                    <h3>{REGION_META[regionId].name}</h3>
                    <span>{regionId === "pangyo" ? "좌측 지도" : "우측 지도"}</span>
                  </div>
                  <div className="split-map-frame">
                    <RegionMap
                      regionId={regionId}
                      boundaries={dataState.boundaries}
                      censusLayer={dataState.censusLayers[regionId]}
                      landuseLayer={dataState.landuseLayers[regionId]}
                      regionStats={dataState.regionStats}
                      transit={dataState.transit}
                      syncedView={syncedView}
                      setSyncedView={setSyncedView}
                      splitMode={true}
                    />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="map-frame">
              <RegionMap
                regionId={activeView}
                boundaries={dataState.boundaries}
                censusLayer={dataState.censusLayers[activeView]}
                landuseLayer={dataState.landuseLayers[activeView]}
                regionStats={dataState.regionStats}
                transit={dataState.transit}
                syncedView={syncedView}
                setSyncedView={setSyncedView}
                splitMode={false}
              />
            </div>
          )}

          <div className="legend-panel">
            <div className="legend-group">
              <strong>접근성 범례</strong>
              <div className="legend-row">
                <span className="legend-dot legend-dot-30" />
                <span>30분 도달 가능 역</span>
              </div>
              <div className="legend-row">
                <span className="legend-dot legend-dot-60" />
                <span>60분 도달 가능 역</span>
              </div>
            </div>

            <div className="legend-group">
              <strong>용도지역 범례</strong>
              {Object.values(LANDUSE_META).map((category) => (
                <div key={category.key} className="legend-row">
                  <span className="legend-swatch" style={{ background: category.color }} />
                  <span>{category.label}</span>
                </div>
              ))}
            </div>

            <div className="legend-group">
              <strong>기본 레이어</strong>
              <div className="legend-row">
                <span className="legend-swatch legend-boundary" />
                <span>분석권역 경계</span>
              </div>
              <div className="legend-row">
                <span className="legend-swatch legend-census" />
                <span>집계구 분포</span>
              </div>
            </div>
          </div>

          <div className="status-strip">
            <span>경계 기준: analysis-boundaries.geojson</span>
            <span>토지이용: UPIS_C_UQ111 기반 재분류</span>
            <span>접근성: 실제 subway_network 최단경로 결과</span>
            <span>건축물 클릭 기능: 도형 미확보로 미구현</span>
          </div>
        </section>

        <aside className="side-column">
          <details className="panel side-panel section-card" open>
            <summary className="section-summary">
              <span>핵심 비교표</span>
              <small>과제 핵심 지표 요약</small>
            </summary>
            <div className="section-body">
              <section className="analysis-info-box">
                <h3>분석 기준</h3>
                <div className="analysis-info-grid">
                  {ANALYSIS_INFO.map((item) => (
                    <div key={item.label} className="analysis-info-row">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </section>

              <table>
                <thead>
                  <tr>
                    <th>지표</th>
                    <th>판교</th>
                    <th>청라</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonTableRows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td className={getWinningRegion(row.pangyo, row.cheongna, "higher") === "pangyo" ? "cell-winner pangyo" : ""}>
                        {formatMetricValue(row.pangyo, row.type)}
                      </td>
                      <td className={getWinningRegion(row.pangyo, row.cheongna, "higher") === "cheongna" ? "cell-winner cheongna" : ""}>
                        {formatMetricValue(row.cheongna, row.type)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <details className="panel side-panel section-card" open>
            <summary className="section-summary">
              <span>접근성 통계</span>
              <small>30분·60분 철도 접근성</small>
            </summary>
            <div className="section-body">
              <div className="reachability-list">
                {activeRegionIds.map((regionId) => {
                  const bundle = regionBundle[regionId];
                  return (
                    <article key={regionId} className="reachability-card">
                      <h3>{bundle.meta.name}</h3>
                      <p className="reachability-note">기준역: {safeStationName(bundle.transitRegion.stationName, bundle.meta.shortName)}</p>
                      <div className="reachability-metric">
                        <span>계산 방식</span>
                        <strong>실제 subway_network 최단경로</strong>
                      </div>
                      {ISOCHRONE_VIEWS.map((minutes) => {
                        const bucket = bundle.transitRegion.timeBuckets?.[minutes];
                        return (
                          <Fragment key={`${regionId}-${minutes}`}>
                            <div className="reachability-metric">
                              <span>{minutes}분 도달 가능 역</span>
                              <strong>{formatNullableNumber(bucket?.reachableStationCount)}</strong>
                            </div>
                            <div className="reachability-metric">
                              <span>{minutes}분 접근 가능 인구</span>
                              <strong>{formatNullableNumber(bucket?.reachablePopulation)}</strong>
                            </div>
                            <div className="reachability-metric">
                              <span>{minutes}분 접근 가능 종사자</span>
                              <strong>{formatNullableNumber(bucket?.reachableWorkers)}</strong>
                            </div>
                          </Fragment>
                        );
                      })}
                    </article>
                  );
                })}
              </div>
            </div>
          </details>

          <details className="panel side-panel section-card" open>
            <summary className="section-summary">
              <span>토지이용 통계</span>
              <small>용도지역 구성비와 LUM</small>
            </summary>
            <div className="section-body">
              <div className="landuse-panels">
                {activeRegionIds.map((regionId) => {
                  const bundle = regionBundle[regionId];
                  return (
                    <article key={regionId} className="building-card">
                      <h3>{bundle.meta.name}</h3>
                      <div className="reachability-metric">
                        <span>LUM</span>
                        <strong>{formatDecimal(bundle.landuseStats?.lum, 3)}</strong>
                      </div>
                      <table className="compact-table">
                        <thead>
                          <tr>
                            <th>분류</th>
                            <th>면적(㎡)</th>
                            <th>비율</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.values(LANDUSE_META).map((category) => {
                            const item = bundle.landuseStats?.categories?.find((entry) => entry.key === category.key);
                            return (
                              <tr key={`${regionId}-${category.key}`}>
                                <td>{category.label}</td>
                                <td>{formatNullableNumber(item?.areaSqm ?? null)}</td>
                                <td>{formatNullablePercent(item?.ratio ?? null)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </article>
                  );
                })}
              </div>
            </div>
          </details>

          <details className="panel side-panel section-card" open>
            <summary className="section-summary">
              <span>비교 그래프</span>
              <small>핵심 지표 시각화</small>
            </summary>
            <div className="section-body">
              <div className="chart-stack">
                <ChartSection title="용도지역 구성비 비교">
                  <GroupedBarChart rows={landuseChartRows} formatter={(value) => `${formatDecimal(value, 2)}%`} />
                </ChartSection>

                <ChartSection title="LUM 비교">
                  <GroupedBarChart rows={lumChartRows} formatter={(value) => formatDecimal(value, 3)} />
                </ChartSection>

                <ChartSection title="직주비 비교">
                  <GroupedBarChart rows={jobsHousingChartRows} formatter={(value) => `${formatDecimal(value, 1)}배`} />
                </ChartSection>

                <ChartSection title="30분/60분 도달 가능 종사자 비교">
                  <GroupedBarChart rows={reachableWorkersChartRows} formatter={(value) => formatNullableNumber(value)} />
                </ChartSection>
              </div>
            </div>
          </details>

          <details className="panel side-panel section-card">
            <summary className="section-summary">
              <span>건축물 통계</span>
              <small>주용도별 수와 연면적 비율</small>
            </summary>
            <div className="section-body">
              <div className="building-grid">
                {buildingPanels.map((item) => (
                  <article key={item.regionId} className="building-card">
                    <h3>{item.region.name}</h3>
                    <div className="reachability-metric">
                      <span>건축물 수</span>
                      <strong>{formatNullableNumber(item.stats.matchedBuildingCount)}</strong>
                    </div>
                    <div className="reachability-metric">
                      <span>총 연면적</span>
                      <strong>{formatNullableNumber(item.stats.totalFloorAreaSum)}</strong>
                    </div>
                    <div className="reachability-metric">
                      <span>평균 용적률</span>
                      <strong>{formatNullablePercent(item.stats.averageFar)}</strong>
                    </div>

                    <div className="mini-chart-grid">
                      <div>
                        <p className="mini-chart-title">주용도별 건축물 수</p>
                        {item.topByCount.map((use) => (
                          <div key={`${item.regionId}-count-${use.useName}`} className="mini-bar-row">
                            <span>{use.useName}</span>
                            <div className="mini-bar-track">
                              <div
                                className={`mini-bar-fill ${item.regionId}`}
                                style={{
                                  width: `${(use.buildingCount / Math.max(...item.topByCount.map((entry) => entry.buildingCount), 1)) * 100}%`,
                                }}
                              />
                            </div>
                            <strong>{formatNullableNumber(use.buildingCount)}</strong>
                          </div>
                        ))}
                      </div>

                      <div>
                        <p className="mini-chart-title">주용도별 연면적 비율</p>
                        {item.topByFloorShare.map((use) => (
                          <div key={`${item.regionId}-floor-${use.useName}`} className="mini-bar-row">
                            <span>{use.useName}</span>
                            <div className="mini-bar-track">
                              <div className={`mini-bar-fill ${item.regionId}`} style={{ width: `${use.floorAreaShare ?? 0}%` }} />
                            </div>
                            <strong>{formatNullablePercent(use.floorAreaShare)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </details>

          <section className="panel side-panel interpretation-panel">
            <div className="section-head">
              <h2>해석</h2>
              <span>보고서용 문구</span>
            </div>
            <p className="panel-note">{INTERPRETATION_NOTE}</p>
          </section>

          <section className="panel side-panel conclusion-card">
            <div className="section-head">
              <h2>결론</h2>
              <span>10초 요약</span>
            </div>
            <p className="panel-note">
              판교는 청라보다 직주비(1.8 vs 0.4), 30분 도달가능 종사자(402,783 vs 119,100), 60분 도달가능 종사자(1,483,290 vs
              874,375) 모두 높게 나타났다.
            </p>
            <p className="panel-note">반면 토지이용 혼합도(LUM)는 청라가 더 높았다.</p>
            <p className="panel-note">
              따라서 업무지구 성과 차이는 토지이용 혼합도보다 접근성과 고용집적 수준의 차이로 설명할 수 있다.
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
}

function RegionMap({ regionId, boundaries, censusLayer, landuseLayer, regionStats, transit, syncedView, setSyncedView, splitMode }) {
  const boundaryFeature = filterBoundaryFeature(boundaries, regionId);
  const boundary = boundaryFeature.features[0];

  return (
    <MapContainer center={syncedView.center} zoom={syncedView.zoom} className="map-container" zoomControl={true}>
      <TileLayer attribution={TILE_SOURCE.attribution} url={TILE_SOURCE.url} />
      <MapViewportController
        regionId={regionId}
        boundaries={boundaries}
        syncedView={syncedView}
        setSyncedView={setSyncedView}
        splitMode={splitMode}
      />

      <GeoJSON
        data={censusLayer}
        style={{
          color: REGION_META[regionId].color,
          weight: 0.5,
          fillColor: REGION_META[regionId].fill,
          fillOpacity: 0.08,
        }}
        onEachFeature={(feature, layer) => {
          layer.bindPopup(
            [
              `<strong>${REGION_META[regionId].name} 집계구</strong>`,
              `cell_id: ${feature.properties.cell_id}`,
              `인구: ${formatNullableNumber(feature.properties.population)}`,
              `가구: ${formatNullableNumber(feature.properties.household)}`,
              `종사자: ${formatNullableNumber(feature.properties.workers)}`,
            ].join("<br />"),
          );
        }}
      />

      <GeoJSON
        data={landuseLayer}
        style={(feature) => {
          const categoryKey = feature?.properties?.landuse_category ?? "other";
          const category = LANDUSE_META[categoryKey] ?? LANDUSE_META.other;
          return {
            color: category.color,
            weight: 1.1,
            fillColor: category.color,
            fillOpacity: 0.34,
          };
        }}
        onEachFeature={(feature, layer) => {
          const categoryKey = feature?.properties?.landuse_category ?? "other";
          const category = LANDUSE_META[categoryKey] ?? LANDUSE_META.other;
          layer.bindPopup(
            [
              `<strong>${REGION_META[regionId].name} 용도지역</strong>`,
              `분류: ${category.label}`,
              `원본값: ${feature.properties?.DGM_NM ?? "데이터 미연결"}`,
            ].join("<br />"),
          );
        }}
      />

      <GeoJSON
        data={boundaryFeature}
        style={{
          color: REGION_META[regionId].color,
          weight: 3.2,
          fillColor: REGION_META[regionId].fill,
          fillOpacity: 0.02,
        }}
        onEachFeature={(feature, layer) => {
          const totals = regionStats?.[regionId]?.totals ?? {};
          layer.bindPopup(
            [
              `<strong>${REGION_META[regionId].name}</strong>`,
              `총인구: ${formatNullableNumber(totals.population)}`,
              `총가구수: ${formatNullableNumber(totals.household)}`,
              `총종사자수: ${formatNullableNumber(totals.workers)}`,
              `직주비: ${formatMetricValue(totals.jobsHousingRatio, "ratio")}`,
            ].join("<br />"),
          );
        }}
      />

      {boundary ? (
        <TooltipPane center={REGION_META[regionId].center} text={REGION_META[regionId].name} className="boundary-label-tooltip" />
      ) : null}

      <KeyStationMarker regionId={regionId} transit={transit} />

      <TransitStationLayer regionId={regionId} transit={transit} minutes={60} radius={6} fillColor="#9b5de5" />
      <TransitStationLayer regionId={regionId} transit={transit} minutes={30} radius={4.5} fillColor="#ff8c42" />
    </MapContainer>
  );
}

function TooltipPane({ center, text, className }) {
  return (
    <CircleMarker center={center} radius={0} pathOptions={{ opacity: 0, fillOpacity: 0 }}>
      <Tooltip permanent direction="center" className={className}>
        <div>{text}</div>
      </Tooltip>
    </CircleMarker>
  );
}

function KeyStationMarker({ regionId, transit }) {
  const details10 = transit?.regions?.[regionId]?.timeBuckets?.[10]?.reachableStationDetails ?? [];
  const details30 = transit?.regions?.[regionId]?.timeBuckets?.[30]?.reachableStationDetails ?? [];
  const detailPool = [...details10, ...details30];
  const keyStation = findKeyStation(regionId, detailPool);

  if (!keyStation) return null;

  return (
    <CircleMarker
      center={[keyStation.lat, keyStation.lng]}
      radius={10}
      pathOptions={{
        color: "#0f1720",
        weight: 3,
        fillColor: "#ffd166",
        fillOpacity: 0.95,
      }}
    >
      <Tooltip permanent direction="top" offset={[0, -12]} className="key-station-tooltip">
        <div>
          <strong>{keyStation.label}</strong>
        </div>
      </Tooltip>
    </CircleMarker>
  );
}

function MapViewportController({ regionId, boundaries, syncedView, setSyncedView, splitMode }) {
  const map = useMap();
  const initializedRef = useRef(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current && boundaries.length) {
      const targetFeatures = splitMode ? boundaries : boundaries.filter((feature) => feature.properties?.id === regionId);
      const bounds = flattenBoundaryCoords(targetFeatures).map(([lng, lat]) => [lat, lng]);
      if (bounds.length) {
        initializedRef.current = true;
        syncingRef.current = true;
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: splitMode ? 11 : 13 });
        setSyncedView({
          center: [map.getCenter().lat, map.getCenter().lng],
          zoom: map.getZoom(),
        });
        setTimeout(() => {
          syncingRef.current = false;
        }, 0);
      }
    }
  }, [boundaries, splitMode, regionId, map, setSyncedView]);

  useEffect(() => {
    const currentCenter = map.getCenter();
    const nextCenter = syncedView.center;
    const currentZoom = map.getZoom();
    const centerChanged =
      Math.abs(currentCenter.lat - nextCenter[0]) > 0.00001 || Math.abs(currentCenter.lng - nextCenter[1]) > 0.00001;
    const zoomChanged = currentZoom !== syncedView.zoom;

    if ((centerChanged || zoomChanged) && !syncingRef.current) {
      syncingRef.current = true;
      map.setView(nextCenter, syncedView.zoom, { animate: false });
      setTimeout(() => {
        syncingRef.current = false;
      }, 0);
    }
  }, [map, syncedView]);

  useMapEvents({
    moveend() {
      if (syncingRef.current) return;
      const center = map.getCenter();
      setSyncedView({
        center: [center.lat, center.lng],
        zoom: map.getZoom(),
      });
    },
    zoomend() {
      if (syncingRef.current) return;
      const center = map.getCenter();
      setSyncedView({
        center: [center.lat, center.lng],
        zoom: map.getZoom(),
      });
    },
  });

  return null;
}

function TransitStationLayer({ regionId, transit, minutes, radius, fillColor }) {
  const stations = transit?.regions?.[regionId]?.timeBuckets?.[minutes]?.reachableStationDetails ?? [];

  return stations.map((station) => (
    <CircleMarker
      key={`${regionId}-${minutes}-${station.id}`}
      center={[station.lat, station.lng]}
      radius={radius}
      pathOptions={{
        color: fillColor,
        weight: minutes === 30 ? 2.4 : 1.8,
        fillColor,
        fillOpacity: minutes === 30 ? 0.95 : 0.32,
      }}
    >
      <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
        <div>
          <strong>{station.name}</strong>
          <br />
          {station.line || "노선명 미표기"}
          <br />
          {minutes}분 도달 가능
        </div>
      </Tooltip>
    </CircleMarker>
  ));
}

function ChartSection({ title, children }) {
  return (
    <section className="chart-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function GroupedBarChart({ rows, formatter }) {
  const globalMax = Math.max(
    ...rows.map((row) => row.max ?? Math.max(row.pangyo ?? 0, row.cheongna ?? 0)),
    1,
  );

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
                  {formatter(row.pangyo ?? 0)}
                </div>
              </div>
            </div>
            <div className="grouped-bar-line">
              <span className="bar-region-label">청라</span>
              <div className="bar-track">
                <div className="bar-value cheongna" style={{ width: `${((row.cheongna ?? 0) / scaleMax) * 100}%` }}>
                  {formatter(row.cheongna ?? 0)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function normalizeLanduseRegion(region) {
  if (!region) return null;
  const categories = Object.values(LANDUSE_META).map((category) => {
    const source = (region.categories ?? []).find((item) => item.key === category.key);
    return {
      ...category,
      areaSqm: source?.areaSqm ?? null,
      ratio: source?.ratio ?? null,
    };
  });

  return {
    regionId: region.regionId,
    regionName: region.regionName,
    lum: region.lum ?? null,
    featureCount: region.featureCount ?? null,
    categories,
  };
}

function rowMetric(label, pangyo, cheongna, type = "number") {
  return { label, pangyo, cheongna, type };
}

function getCategoryRatio(region, key) {
  return region?.categories?.find((item) => item.key === key)?.ratio ?? null;
}

function safeStationName(value, fallback) {
  if (!value || value.includes("?")) return `${fallback} 기준역`;
  return value;
}

function findKeyStation(regionId, details) {
  const unique = details.filter(
    (station, index, array) => array.findIndex((item) => item.id === station.id) === index,
  );

  if (regionId === "pangyo") {
    const station =
      unique.find((item) => normalizeKorean(item.name).includes("판교")) ??
      unique.find((item) => normalizeKorean(item.line).includes("신분당")) ??
      unique.find((item) => normalizeKorean(item.line).includes("경강")) ??
      unique[0];

    return station ? { ...station, label: "판교역" } : null;
  }

  const station =
    unique.find((item) => normalizeKorean(item.name).includes("청라")) ??
    unique.find((item) => normalizeKorean(item.name).includes("국제도시")) ??
    unique[0];

  return station ? { ...station, label: "청라 분석 기준역" } : null;
}

function normalizeKorean(value) {
  return String(value ?? "").replace(/\?/g, "").replace(/\s+/g, "");
}

function getWinningRegion(pangyo, cheongna, mode = "higher") {
  if (pangyo === null || pangyo === undefined || cheongna === null || cheongna === undefined) return null;
  if (Number(pangyo) === Number(cheongna)) return null;
  if (mode === "higher") return Number(pangyo) > Number(cheongna) ? "pangyo" : "cheongna";
  return Number(pangyo) < Number(cheongna) ? "pangyo" : "cheongna";
}

function filterBoundaryFeature(features, regionId) {
  return {
    type: "FeatureCollection",
    features: features.filter((feature) => feature.properties?.id === regionId),
  };
}

function flattenBoundaryCoords(features) {
  const coords = [];

  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    if (geometry.type === "Polygon") {
      geometry.coordinates.forEach((ring) => ring.forEach((coord) => coords.push(coord)));
    }

    if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach((polygon) => {
        polygon.forEach((ring) => ring.forEach((coord) => coords.push(coord)));
      });
    }
  }

  return coords;
}

function formatNumber(value, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits,
  }).format(Number(value ?? 0));
}

function formatNullableNumber(value) {
  if (value === null || value === undefined) return "데이터 미연결";
  return formatNumber(value, Number.isInteger(Number(value)) ? 0 : 1);
}

function formatNullablePercent(value) {
  if (value === null || value === undefined) return "데이터 미연결";
  return `${formatNumber(value, 2)}%`;
}

function formatDecimal(value, digits = 3) {
  if (value === null || value === undefined) return "데이터 미연결";
  return Number(value).toFixed(digits);
}

function formatMetricValue(value, type = "number") {
  if (type === "percent") return formatNullablePercent(value);
  if (type === "ratio") return value === null || value === undefined ? "데이터 미연결" : `${formatNumber(value, 1)}배`;
  if (type === "decimal3") return formatDecimal(value, 3);
  return formatNullableNumber(value);
}

export default App;
