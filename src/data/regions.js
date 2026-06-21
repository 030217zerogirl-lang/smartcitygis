export const REGION_VIEWS = {
  pangyo: {
    id: "pangyo",
    name: "판교",
    anchor: [37.402, 127.111],
    zoom: 14,
    coreStation: {
      name: "판교역",
      location: [37.39476, 127.11118],
    },
    colors: {
      primary: "#0b5d7a",
      fill: "#3aaed8",
      iso30: "#ff8a00",
      iso60: "#ffd166",
    },
    rangePolygon: [
      [37.414, 127.093],
      [37.414, 127.126],
      [37.4, 127.133],
      [37.387, 127.121],
      [37.39, 127.094],
    ],
    landUsePolygons: [
      {
        id: "pangyo-office-core",
        name: "업무복합 중심지",
        ratio: 48,
        coordinates: [
          [37.4055, 127.104],
          [37.4055, 127.117],
          [37.398, 127.119],
          [37.3968, 127.105],
        ],
      },
      {
        id: "pangyo-support",
        name: "지원시설권역",
        ratio: 32,
        coordinates: [
          [37.4105, 127.118],
          [37.4105, 127.127],
          [37.4015, 127.129],
          [37.399, 127.119],
        ],
      },
    ],
    buildings: [
      { id: "pangyo-b1", name: "알파돔타워", location: [37.3955, 127.11], floorArea: 240000 },
      { id: "pangyo-b2", name: "테크원", location: [37.4015, 127.108], floorArea: 160000 },
      { id: "pangyo-b3", name: "유스페이스", location: [37.4036, 127.114], floorArea: 120000 },
    ],
    compareMetrics: {
      officeCount: 128,
      officeFloorArea: "2,340,000㎡",
      landUseShare: "업무 48% / 지원 32% / 기타 20%",
      pop30: "1,180,000명",
      pop60: "4,650,000명",
      jobs30: "720,000명",
      jobs60: "2,880,000명",
    },
  },
  cheongna: {
    id: "cheongna",
    name: "청라",
    anchor: [37.534, 126.65],
    zoom: 13,
    coreStation: {
      name: "청라국제도시역",
      location: [37.55628, 126.62471],
    },
    colors: {
      primary: "#155724",
      fill: "#63c174",
      iso30: "#ff595e",
      iso60: "#ffca3a",
    },
    rangePolygon: [
      [37.551, 126.625],
      [37.549, 126.669],
      [37.529, 126.678],
      [37.511, 126.655],
      [37.518, 126.622],
    ],
    landUsePolygons: [
      {
        id: "cheongna-office-core",
        name: "국제업무 중심지",
        ratio: 36,
        coordinates: [
          [37.539, 126.638],
          [37.539, 126.656],
          [37.528, 126.658],
          [37.527, 126.641],
        ],
      },
      {
        id: "cheongna-waterfront",
        name: "복합상업 수변권역",
        ratio: 29,
        coordinates: [
          [37.544, 126.657],
          [37.544, 126.672],
          [37.533, 126.674],
          [37.531, 126.658],
        ],
      },
    ],
    buildings: [
      { id: "cheongna-b1", name: "국제업무지구 A", location: [37.5342, 126.648], floorArea: 120000 },
      { id: "cheongna-b2", name: "복합타워 B", location: [37.5367, 126.655], floorArea: 90000 },
      { id: "cheongna-b3", name: "수변오피스 C", location: [37.5295, 126.662], floorArea: 70000 },
    ],
    compareMetrics: {
      officeCount: 74,
      officeFloorArea: "1,280,000㎡",
      landUseShare: "업무 36% / 상업 29% / 기타 35%",
      pop30: "620,000명",
      pop60: "2,450,000명",
      jobs30: "280,000명",
      jobs60: "1,180,000명",
    },
  },
};

export const REGION_ORDER = ["pangyo", "cheongna"];
