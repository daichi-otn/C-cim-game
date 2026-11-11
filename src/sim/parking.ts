export interface ParkingLot { id: number; x: number; y: number; capacity: number; used: number; }
export const PARKING_COST = 3_000_000;
export const PARKING_CAPACITY = 40;

export function parkingUsed(population: number, transitRidership: number, capacity: number): number {
  return Math.min(capacity, Math.max(0, Math.round(population * 0.12 - transitRidership * 0.35)));
}
