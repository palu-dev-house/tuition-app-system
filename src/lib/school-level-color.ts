export type SchoolLevel = "TK" | "SD" | "SMP" | "SMA";

const COLOR_MAP: Record<SchoolLevel, string> = {
  TK: "pink",
  SD: "blue",
  SMP: "teal",
  SMA: "orange",
};

export function schoolLevelColor(
  level: SchoolLevel | string | null | undefined,
): string {
  if (!level) return "gray";
  return COLOR_MAP[level as SchoolLevel] ?? "gray";
}
