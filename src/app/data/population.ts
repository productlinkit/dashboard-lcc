/*
 * Citizen registry & family book demo data (PRD §11 — Population & Households).
 *
 * Households are generated first and citizens are derived from their members, so
 * every aggregate (household size, gender split, age pyramid) stays internally
 * consistent. Deterministic: same output on every load.
 */
import { PROVINCE_STATS } from "./mockData";
import { hashStr } from "./derive";

export type Gender = "male" | "female";
export type CitizenStatus = "active" | "deceased" | "moved";
export type Nationality = "Lao" | "Foreign";

export interface Citizen {
  uin: string; // Unique Identification Number
  name: string;
  gender: Gender;
  dob: string; // YYYY-MM-DD
  age: number;
  relation: string; // relation to the head of household
  province: string;
  district: string;
  village: string;
  householdNo: string;
  status: CitizenStatus;
  nationality: Nationality;
}

export interface Household {
  no: string; // family book number
  head: string;
  province: string;
  district: string;
  village: string;
  registered: string; // YYYY-MM-DD
  members: Citizen[];
}

/* ── Deterministic PRNG (mulberry32) — stable across reloads ── */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MALE_NAMES = [
  "Somchai", "Bounthavy", "Khampheng", "Phout", "Thongdy", "Sengphet", "Oudom", "Somphone",
  "Bounmy", "Viengkham", "Khamla", "Anousone", "Sisavath", "Vilaysack", "Chanthala", "Souvanh",
];
const FEMALE_NAMES = [
  "Noy", "Latda", "Manivanh", "Vilaiphone", "Malaythong", "Dao", "Keo", "Souksavanh",
  "Phonesavanh", "Chanthaly", "Bualy", "Khamsy", "Vandara", "Somsy", "Nalin", "Phaivanh",
];
const SURNAMES = [
  "Vongphakdy", "Sisoulath", "Phanthavong", "Keomanivong", "Sengdara", "Inthasone", "Bounyavong",
  "Chanthaphone", "Xaiyavong", "Souphanousinh", "Namvong", "Rasphone", "Thammavong", "Detsana",
  "Soukaloun", "Phommachanh", "Sayavong", "Khounnavong", "Rattanavong", "Inthavong",
];
const DISTRICT_PREFIX = ["Chanthabouly", "Sikhottabong", "Xaysetha", "Sisattanak", "Naxaithong", "Hadxaifong", "Xaythany"];
const VILLAGE_PREFIX = ["Ban Phonsavanh", "Ban Nongbone", "Ban Thatluang", "Ban Dongpalep", "Ban Sikhai", "Ban Nongping", "Ban Xiengda", "Ban Houayhong"];

/* Household composition templates — relation to the head, with age offsets. */
interface Slot {
  relation: string;
  gender?: Gender;
  ageFrom: number; // relative to head's age (negative = older)
  ageTo: number;
}
const SPOUSE: Slot = { relation: "Spouse", ageFrom: -6, ageTo: 4 };
const CHILD: Slot = { relation: "Child", ageFrom: -45, ageTo: -20 };
const PARENT: Slot = { relation: "Parent", ageFrom: 22, ageTo: 34 };
const SIBLING: Slot = { relation: "Sibling", ageFrom: -8, ageTo: 8 };

const COMPOSITIONS: Slot[][] = [
  [SPOUSE, CHILD],
  [SPOUSE, CHILD, CHILD],
  [SPOUSE, CHILD, CHILD, CHILD],
  [SPOUSE, CHILD, CHILD, PARENT],
  [SPOUSE, CHILD, PARENT, PARENT],
  [SPOUSE],
  [CHILD, CHILD],
  [SPOUSE, CHILD, CHILD, SIBLING],
  [],
];

/* Provinces weighted by registration volume, so the busy ones have more households. */
const PROVINCE_POOL: string[] = Object.entries(PROVINCE_STATS).flatMap(([name, count]) =>
  Array.from({ length: Math.max(1, Math.round(count / 60)) }, () => name),
);

const TODAY = new Date();
const THIS_YEAR = TODAY.getFullYear();

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dobFor(age: number, rnd: () => number): string {
  const year = THIS_YEAR - age;
  const month = 1 + Math.floor(rnd() * 12);
  const day = 1 + Math.floor(rnd() * 28);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function buildHouseholds(count: number): Household[] {
  const rnd = mulberry32(20260720);
  const out: Household[] = [];

  for (let i = 0; i < count; i++) {
    const province = PROVINCE_POOL[Math.floor(rnd() * PROVINCE_POOL.length)];
    const district = `${DISTRICT_PREFIX[Math.floor(rnd() * DISTRICT_PREFIX.length)]} District`;
    const village = VILLAGE_PREFIX[Math.floor(rnd() * VILLAGE_PREFIX.length)];
    const surname = SURNAMES[Math.floor(rnd() * SURNAMES.length)];
    const no = `FB-${THIS_YEAR}-${String(10_000 + i).padStart(6, "0")}`;

    const headGender: Gender = rnd() < 0.68 ? "male" : "female";
    const headAge = 28 + Math.floor(rnd() * 42); // 28–69
    const composition = COMPOSITIONS[Math.floor(rnd() * COMPOSITIONS.length)];
    // Foreign residents are registered as whole households, and are rare (~2%).
    const nationality: Nationality = rnd() < 0.02 ? "Foreign" : "Lao";

    const regDaysAgo = Math.floor(rnd() * 2200); // registered over the last ~6 years
    const regDate = new Date(TODAY);
    regDate.setDate(regDate.getDate() - regDaysAgo);
    const registered = `${regDate.getFullYear()}-${pad2(regDate.getMonth() + 1)}-${pad2(regDate.getDate())}`;

    const members: Citizen[] = [];
    const push = (relation: string, gender: Gender, age: number) => {
      const given = gender === "male"
        ? MALE_NAMES[Math.floor(rnd() * MALE_NAMES.length)]
        : FEMALE_NAMES[Math.floor(rnd() * FEMALE_NAMES.length)];
      // Deceased/moved only apply to a small share, and never to the head.
      const roll = rnd();
      const status: CitizenStatus =
        relation === "Head" ? "active" : roll > 0.975 ? "deceased" : roll > 0.94 ? "moved" : "active";
      members.push({
        uin: `LA${String(Math.floor(rnd() * 1e10)).padStart(10, "0")}`,
        name: `${given} ${surname}`,
        gender,
        dob: dobFor(age, rnd),
        age,
        relation,
        province,
        district,
        village,
        householdNo: no,
        status,
        nationality,
      });
    };

    push("Head", headGender, headAge);
    for (const slot of composition) {
      const gender: Gender = slot.gender ?? (rnd() < 0.5 ? "male" : "female");
      const offset = slot.ageFrom + Math.floor(rnd() * (slot.ageTo - slot.ageFrom + 1));
      const age = Math.max(0, Math.min(96, headAge + offset));
      push(slot.relation, slot.relation === "Spouse" ? (headGender === "male" ? "female" : "male") : gender, age);
    }

    out.push({ no, head: members[0].name, province, district, village, registered, members });
  }

  return out;
}

export const HOUSEHOLDS: Household[] = buildHouseholds(420);
export const CITIZENS: Citizen[] = HOUSEHOLDS.flatMap((h) => h.members);

export const HOUSEHOLD_BY_NO: Record<string, Household> = Object.fromEntries(
  HOUSEHOLDS.map((h) => [h.no, h]),
);

/* Working age follows the standard 15–64 band; everyone else is a dependent. */
export const WORKING_AGE = { from: 15, to: 64 };
const isWorkingAge = (c: Citizen) => c.age >= WORKING_AGE.from && c.age <= WORKING_AGE.to;

/* ── Registered-population demographic trend (last 12 months) ──
 * Deterministic monthly flows; the population line is back-computed to end at
 * today's registered total, so births − deaths + in − out reconciles with it. */
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface DemoMonth {
  month: string;
  births: number;
  deaths: number;
  movedIn: number;
  movedOut: number;
  population: number;
}

function buildDemographicTrend(): DemoMonth[] {
  const rnd = mulberry32(20260804);
  const flows = Array.from({ length: 12 }, () => ({
    births: 20 + Math.floor(rnd() * 14), // 20–33
    deaths: 10 + Math.floor(rnd() * 8), // 10–17
    movedIn: 8 + Math.floor(rnd() * 8), // 8–15
    movedOut: 6 + Math.floor(rnd() * 7), // 6–11
  }));

  // Latest month ends at the current registered total; walk backwards.
  const pop = new Array<number>(12);
  pop[11] = CITIZENS.length;
  for (let m = 10; m >= 0; m--) {
    const f = flows[m + 1];
    pop[m] = pop[m + 1] - (f.births - f.deaths + f.movedIn - f.movedOut);
  }

  return flows.map((f, m) => {
    const d = new Date(THIS_YEAR, TODAY.getMonth() - (11 - m), 1);
    return {
      month: `${MONTH_ABBR[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`,
      ...f,
      population: pop[m],
    };
  });
}

export const DEMOGRAPHIC_TREND: DemoMonth[] = buildDemographicTrend();

const sum = (key: keyof DemoMonth) => DEMOGRAPHIC_TREND.reduce((a, m) => a + (m[key] as number), 0);
const popStart = DEMOGRAPHIC_TREND[0].population;
const popEnd = DEMOGRAPHIC_TREND[DEMOGRAPHIC_TREND.length - 1].population;

/* ── Per-region comparison ── */
export interface RegionStat {
  province: string;
  population: number;
  households: number;
  male: number;
  female: number;
  foreign: number;
  workingAge: number;
  growthPct: number;
}

function buildRegionStats(): RegionStat[] {
  const hhByProvince: Record<string, number> = {};
  for (const h of HOUSEHOLDS) hhByProvince[h.province] = (hhByProvince[h.province] ?? 0) + 1;

  const byProvince: Record<string, RegionStat> = {};
  for (const c of CITIZENS) {
    const r = (byProvince[c.province] ??= {
      province: c.province,
      population: 0,
      households: hhByProvince[c.province] ?? 0,
      male: 0,
      female: 0,
      foreign: 0,
      workingAge: 0,
      // Deterministic annual growth per province, −1.5% … +5.0%.
      growthPct: +(((hashStr(c.province) % 65) - 15) / 10).toFixed(1),
    });
    r.population += 1;
    if (c.gender === "male") r.male += 1;
    else r.female += 1;
    if (c.nationality === "Foreign") r.foreign += 1;
    if (isWorkingAge(c)) r.workingAge += 1;
  }
  return Object.values(byProvince).sort((a, b) => b.population - a.population);
}

export const REGION_STATS: RegionStat[] = buildRegionStats();

/* ── Aggregates used by the page header ── */
const workingAge = CITIZENS.filter(isWorkingAge).length;
const dependents = CITIZENS.length - workingAge;
const foreign = CITIZENS.filter((c) => c.nationality === "Foreign").length;

export const POPULATION_SUMMARY = {
  citizens: CITIZENS.length,
  households: HOUSEHOLDS.length,
  avgHouseholdSize: CITIZENS.length / HOUSEHOLDS.length,
  male: CITIZENS.filter((c) => c.gender === "male").length,
  female: CITIZENS.filter((c) => c.gender === "female").length,
  active: CITIZENS.filter((c) => c.status === "active").length,
  deceased: CITIZENS.filter((c) => c.status === "deceased").length,
  moved: CITIZENS.filter((c) => c.status === "moved").length,
  minors: CITIZENS.filter((c) => c.age < 18).length,
  seniors: CITIZENS.filter((c) => c.age >= 60).length,
  workingAge,
  dependents,
  dependencyRatio: workingAge ? Math.round((dependents / workingAge) * 100) : 0,
  foreign,
  local: CITIZENS.length - foreign,
  // Vital & migration over the last 12 months
  births: sum("births"),
  deaths: sum("deaths"),
  movedIn: sum("movedIn"),
  movedOut: sum("movedOut"),
  netMigration: sum("movedIn") - sum("movedOut"),
  naturalIncrease: sum("births") - sum("deaths"),
  growthAbs: popEnd - popStart,
  growthPct: popStart ? +(((popEnd - popStart) / popStart) * 100).toFixed(1) : 0,
};

export const AGE_BANDS = [
  { band: "0–17", from: 0, to: 17 },
  { band: "18–29", from: 18, to: 29 },
  { band: "30–44", from: 30, to: 44 },
  { band: "45–59", from: 45, to: 59 },
  { band: "60+", from: 60, to: 200 },
];

export function ageDistribution(citizens: Citizen[]) {
  return AGE_BANDS.map((b) => ({
    band: b.band,
    male: citizens.filter((c) => c.gender === "male" && c.age >= b.from && c.age <= b.to).length,
    female: citizens.filter((c) => c.gender === "female" && c.age >= b.from && c.age <= b.to).length,
  }));
}

export const PROVINCE_NAMES = Object.keys(PROVINCE_STATS);

/* ── Location drill-down (Country → Province → District → Village) ──
 * Every citizen and household carries province/district/village, so any level
 * is just a filter. This powers the GIS map's location explorer. */
export type AreaLevel = "country" | "province" | "district" | "village";

export interface AreaChild {
  name: string;
  population: number;
  households: number;
}

export interface AreaStat {
  level: AreaLevel;
  name: string;
  path: { province?: string; district?: string; village?: string };
  population: number;
  households: number;
  male: number;
  female: number;
  workingAge: number;
  minors: number;
  seniors: number;
  foreign: number;
  ageBands: { band: string; male: number; female: number }[];
  childLabel: string; // what the children are ("Provinces", "Districts"…)
  children: AreaChild[];
}

export function areaStat(province?: string | null, district?: string | null, village?: string | null): AreaStat {
  const cz = CITIZENS.filter(
    (c) =>
      (!province || c.province === province) &&
      (!district || c.district === district) &&
      (!village || c.village === village),
  );
  const hh = HOUSEHOLDS.filter(
    (h) =>
      (!province || h.province === province) &&
      (!district || h.district === district) &&
      (!village || h.village === village),
  );

  const level: AreaLevel = village ? "village" : district ? "district" : province ? "province" : "country";
  const name = village || district || province || "Lao PDR";

  // Children are the next level down, with their own population & household count.
  let childLabel = "";
  const groups: Record<string, { population: number; households: Set<string> }> = {};
  const keyFor = (c: Citizen): string | null => {
    if (level === "country") return c.province;
    if (level === "province") return c.district;
    if (level === "district") return c.village;
    return null;
  };
  if (level !== "village") {
    childLabel = level === "country" ? "Provinces" : level === "province" ? "Districts" : "Villages";
    for (const c of cz) {
      const k = keyFor(c);
      if (!k) continue;
      (groups[k] ??= { population: 0, households: new Set() }).population += 1;
      groups[k].households.add(c.householdNo);
    }
  }
  const children: AreaChild[] = Object.entries(groups)
    .map(([n, g]) => ({ name: n, population: g.population, households: g.households.size }))
    .sort((a, b) => b.population - a.population);

  return {
    level,
    name,
    path: { province: province ?? undefined, district: district ?? undefined, village: village ?? undefined },
    population: cz.length,
    households: hh.length,
    male: cz.filter((c) => c.gender === "male").length,
    female: cz.filter((c) => c.gender === "female").length,
    workingAge: cz.filter(isWorkingAge).length,
    minors: cz.filter((c) => c.age < 18).length,
    seniors: cz.filter((c) => c.age >= 60).length,
    foreign: cz.filter((c) => c.nationality === "Foreign").length,
    ageBands: ageDistribution(cz),
    childLabel,
    children,
  };
}

/* Population per province — the map's default colour metric. */
export const POPULATION_BY_PROVINCE: Record<string, number> = Object.fromEntries(
  REGION_STATS.map((r) => [r.province, r.population]),
);
