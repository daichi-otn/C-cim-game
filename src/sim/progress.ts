/** M14 の統計・マイルストーン・目標。保存データを変更せず、現在の街から毎回求める。 */
export interface CityProgressSource {
  zones: { totals(): { population: number }; stats?: () => Record<string, { buildings: number }> };
  facilities: { size: number }[] | Map<number, { size: number }>;
  graph: { edges: Map<number, unknown> };
  money: number;
  demand: { r: number; c: number; i: number; o: number };
  health: { meanRisk: number; sick: number };
  traffic: { jammed: number; flow: number | Map<number, number> };
}

export interface CityStatistics {
  population: number;
  buildings: number;
  facilities: number;
  roads: number;
  money: number;
  demand: { r: number; c: number; i: number; o: number };
  environmentalRisk: number;
  sick: number;
  jammedRoads: number;
  trafficFlow: number;
}

export interface Milestone {
  id: string;
  name: string;
  done: boolean;
  detail: string;
}

export function statisticsOf(city: CityProgressSource): CityStatistics {
  const totals = city.zones.totals();
  const zoneStats = city.zones.stats?.() ?? {};
  const buildings = Object.values(zoneStats).reduce((sum, row) => sum + row.buildings, 0);
  const facilities = city.facilities instanceof Map ? city.facilities.size : city.facilities.length;
  const flow = typeof city.traffic.flow === "number" ? city.traffic.flow : [...city.traffic.flow.values()].reduce((sum, n) => sum + n, 0);
  return {
    population: Math.round(totals.population),
    buildings: Math.round(buildings),
    facilities,
    roads: city.graph.edges.size,
    money: Math.round(city.money),
    demand: { ...city.demand },
    environmentalRisk: Math.max(0, Math.min(1, city.health.meanRisk)),
    sick: Math.round(city.health.sick),
    jammedRoads: city.traffic.jammed,
    trafficFlow: Math.round(flow),
  };
}

export function milestonesOf(s: CityStatistics): Milestone[] {
  const rows: [string, string, boolean, string][] = [
    ["population-100", "人口 100 人", s.population >= 100, `現在 ${s.population} 人`],
    ["population-500", "人口 500 人", s.population >= 500, `現在 ${s.population} 人`],
    ["buildings-10", "建物を 10 棟", s.buildings >= 10, `現在 ${s.buildings} 棟`],
    ["facilities-3", "施設を 3 つ", s.facilities >= 3, `現在 ${s.facilities} 施設`],
    ["roads-20", "道路を 20 区間", s.roads >= 20, `現在 ${s.roads} 区間`],
    ["healthy-city", "健康な街", s.environmentalRisk < 0.2 && s.sick < 1, `環境リスク ${Math.round(s.environmentalRisk * 100)}%`],
  ];
  return rows.map(([id, name, done, detail]) => ({ id, name, done, detail }));
}

export function nextGoalOf(s: CityStatistics, milestones = milestonesOf(s)): string {
  const next = milestones.find((m) => !m.done);
  if (next) return `目標: ${next.name} (${next.detail})`;
  if (s.jammedRoads > 0) return `目標: 渋滞を解消する (${s.jammedRoads} 区間)`;
  return "目標: 街をさらに発展させる";
}
