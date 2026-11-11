/** M12 公共交通の保存形式。道路・建物の計算と独立しているため、旧セーブはそのまま読める。 */
export type TransitMode = "bus" | "subway" | "rail";

export interface TransitStop {
  id: number;
  x: number;
  y: number;
  name: string;
}

export interface TransitLine {
  id: number;
  name: string;
  mode: TransitMode;
  stopIds: number[];
  vehicles: number;
  ridership: number;
}

export interface TransitData {
  nextStopId: number;
  nextLineId: number;
  stops: TransitStop[];
  lines: TransitLine[];
}

export function emptyTransitData(): TransitData {
  return { nextStopId: 1, nextLineId: 1, stops: [], lines: [] };
}

export function transitRidership(population: number, stops: number, lines: number): number {
  if (population <= 0 || stops < 2 || lines <= 0) return 0;
  return Math.min(Math.round(population * 0.35), Math.round(population * Math.min(0.35, stops * 0.04) * Math.min(2, lines)));
}

export function validateTransitData(data: TransitData): void {
  if (!Number.isInteger(data.nextStopId) || data.nextStopId < 1 || !Number.isInteger(data.nextLineId) || data.nextLineId < 1) throw new Error("公共交通の内部状態が不正です");
  const ids = new Set<number>();
  for (const stop of data.stops) {
    if (!Number.isInteger(stop.id) || stop.id < 1 || ids.has(stop.id) || !Number.isFinite(stop.x) || !Number.isFinite(stop.y) || typeof stop.name !== "string" || stop.name.length > 24) throw new Error("停留所のデータが不正です");
    ids.add(stop.id);
  }
  const lineIds = new Set<number>();
  for (const line of data.lines) {
    if (!Number.isInteger(line.id) || line.id < 1 || lineIds.has(line.id) || typeof line.name !== "string" || line.name.length > 24 || !["bus", "subway", "rail"].includes(line.mode) || !Number.isInteger(line.vehicles) || line.vehicles < 0 || !Number.isInteger(line.ridership) || line.ridership < 0 || line.stopIds.length < 2 || line.stopIds.some((id) => !ids.has(id))) throw new Error("路線のデータが不正です");
    lineIds.add(line.id);
  }
}
