/**
 * M23 の災害・危機管理で使う、描画に依存しない計算。
 * 災害そのものは City が管理し、ここでは避難・物資・復旧優先度・条例効果を扱う。
 */

export type CrisisKind = "fire" | "flood" | "quake" | "outage";
export type RecoveryTargetKind = "facility" | "road";
export type RecoveryPriority = "critical" | "high" | "normal";

export interface RecoveryTarget {
  kind: RecoveryTargetKind;
  id: number;
}

export interface RecoveryPriorityEntry extends RecoveryTarget {
  priority: RecoveryPriority;
}

export interface CrisisEvacuation {
  kind: CrisisKind;
  x: number;
  y: number;
  started: number;
  ordered: boolean;
}

export interface CrisisRelief {
  kind: CrisisKind;
  delivered: number;
}

/** 街のセーブに含める危機管理の追加状態。すべて旧セーブでは省略可能。 */
export interface CrisisData {
  evacuation?: CrisisEvacuation | null;
  relief?: CrisisRelief | null;
  priorities?: RecoveryPriorityEntry[];
}

export interface CrisisPolicyEffect {
  enabled: boolean;
  monthlyCostPerResident: number;
  damageChanceReduction: number;
  recoveryDaysShortened: number;
  fireResponseDaysShortened: number;
  evacuationReadiness: number;
  reliefNeedReduction: number;
}

export interface CoordinationStatus {
  fire: boolean;
  police: boolean;
  hospital: boolean;
  score: number;
}

export interface EvacuationStats {
  affectedResidents: number;
  shelterCapacity: number;
  evacuatedResidents: number;
  unaccommodatedResidents: number;
}

export interface ReliefStats {
  required: number;
  delivered: number;
  coverage: number;
}

export const CRISIS_KIND_NAMES: Record<CrisisKind, string> = {
  fire: "火災",
  flood: "洪水",
  quake: "地震",
  outage: "停電",
};

export const RECOVERY_PRIORITY_NAMES: Record<RecoveryPriority, string> = {
  critical: "最優先",
  high: "優先",
  normal: "通常",
};

export const RELIEF_UNIT_COST = 100_000;
export const RELIEF_UNIT_CAPACITY = 20;

export function emptyCrisisData(): CrisisData {
  return { evacuation: null, relief: null, priorities: [] };
}

export function crisisPolicyEffect(enabled: boolean): CrisisPolicyEffect {
  return enabled
    ? {
        enabled: true,
        monthlyCostPerResident: 500,
        damageChanceReduction: 1 / 3,
        recoveryDaysShortened: 2,
        fireResponseDaysShortened: 1,
        evacuationReadiness: 0.2,
        reliefNeedReduction: 0.15,
      }
    : {
        enabled: false,
        monthlyCostPerResident: 0,
        damageChanceReduction: 0,
        recoveryDaysShortened: 0,
        fireResponseDaysShortened: 0,
        evacuationReadiness: 0,
        reliefNeedReduction: 0,
      };
}

export function reliefRequired(kind: CrisisKind, affectedResidents: number, affectedAssets: number, policy: CrisisPolicyEffect): number {
  const perResident = kind === "outage" ? 0.25 : kind === "fire" ? 0.5 : 1;
  const perAsset = kind === "outage" ? 5 : kind === "fire" ? 8 : 12;
  return Math.max(1, Math.ceil((affectedResidents * perResident + affectedAssets * perAsset) / RELIEF_UNIT_CAPACITY / (1 + policy.reliefNeedReduction)));
}

export function reliefStats(kind: CrisisKind, affectedResidents: number, affectedAssets: number, delivered: number, policy: CrisisPolicyEffect): ReliefStats {
  const required = reliefRequired(kind, affectedResidents, affectedAssets, policy);
  return { required, delivered: Math.max(0, delivered), coverage: Math.min(1, Math.max(0, delivered / required)) };
}

export function evacuationStats(affectedResidents: number, shelterCapacity: number, ordered: boolean, policy: CrisisPolicyEffect): EvacuationStats {
  const affected = Math.max(0, Math.round(affectedResidents));
  const capacity = Math.max(0, Math.round(shelterCapacity));
  const readiness = ordered ? 1 : policy.evacuationReadiness;
  const evacuatedResidents = Math.min(affected, Math.round(capacity * readiness));
  return {
    affectedResidents: affected,
    shelterCapacity: capacity,
    evacuatedResidents,
    unaccommodatedResidents: Math.max(0, affected - evacuatedResidents),
  };
}

export function coordinationScore(status: Omit<CoordinationStatus, "score">): CoordinationStatus {
  const score = [status.fire, status.police, status.hospital].filter(Boolean).length / 3;
  return { ...status, score };
}

export function recoveryDaysFor(priority: RecoveryPriority, baseDays: number): number {
  const reduction = priority === "critical" ? 4 : priority === "high" ? 2 : 0;
  return Math.max(1, baseDays - reduction);
}

export function recoveryPriorityOf(entries: readonly RecoveryPriorityEntry[], target: RecoveryTarget): RecoveryPriority {
  return entries.find((entry) => entry.kind === target.kind && entry.id === target.id)?.priority ?? "normal";
}

export function validateCrisisData(data: CrisisData, day: number, facilityIds: ReadonlySet<number>, roadIds: ReadonlySet<number>): void {
  const validKind = (value: unknown): value is CrisisKind => value === "fire" || value === "flood" || value === "quake" || value === "outage";
  const validPriority = (value: unknown): value is RecoveryPriority => value === "critical" || value === "high" || value === "normal";
  if (data.evacuation !== undefined && data.evacuation !== null) {
    const e = data.evacuation;
    if (!validKind(e.kind) || !Number.isInteger(e.x) || !Number.isInteger(e.y) || !Number.isInteger(e.started) || e.started < 0 || e.started > day || typeof e.ordered !== "boolean") throw new Error("避難のデータが不正です");
  }
  if (data.relief !== undefined && data.relief !== null) {
    const r = data.relief;
    if (!validKind(r.kind) || !Number.isInteger(r.delivered) || r.delivered < 0) throw new Error("救援物資のデータが不正です");
  }
  if (data.priorities !== undefined) {
    if (!Array.isArray(data.priorities)) throw new Error("復旧優先度のデータが不正です");
    const seen = new Set<string>();
    for (const entry of data.priorities) {
      if (!entry || (entry.kind !== "facility" && entry.kind !== "road") || !Number.isInteger(entry.id) || entry.id < 1 || !validPriority(entry.priority)) throw new Error("復旧優先度のデータが不正です");
      const ids = entry.kind === "facility" ? facilityIds : roadIds;
      if (!ids.has(entry.id)) throw new Error("復旧優先度の対象が存在しません");
      const key = `${entry.kind}:${entry.id}`;
      if (seen.has(key)) throw new Error("復旧優先度が重複しています");
      seen.add(key);
    }
  }
}
