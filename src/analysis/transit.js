export function buildIsochroneLegend(region) {
  return [
    {
      id: `${region.id}-iso-30`,
      label: "30분 등시간권",
      minutes: 30,
      color: region.colors.iso30,
      center: region.anchor,
      radius: 3200,
    },
    {
      id: `${region.id}-iso-60`,
      label: "60분 등시간권",
      minutes: 60,
      color: region.colors.iso60,
      center: region.anchor,
      radius: 6200,
    },
  ];
}

// 추후 subway_network.zip 내부 nodes/links.tsv를 전처리해 실제 등시간권 생성 로직으로 교체한다.
export function createTransitAnalysis(regions) {
  return regions.map((region) => ({
    regionId: region.id,
    station: region.coreStation,
    isochrones: buildIsochroneLegend(region),
  }));
}
