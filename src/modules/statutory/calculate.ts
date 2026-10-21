// Pure statutory math (no I/O) so every rule type is unit-testable against hand calculation
// (SC-002). Amounts are rounded to 2 decimals per line.
import type { Rule, SalaryBase } from "./schema.js";

export interface Bases {
  prorated: { basic: number; hra: number; gross: number };
  fullMonth: { basic: number; hra: number; gross: number };
  prorationRatio: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function pick(base: SalaryBase, amounts: { basic: number; hra: number; gross: number }) {
  if (base === "BASIC") return amounts.basic;
  if (base === "BASIC_PLUS_HRA") return amounts.basic + amounts.hra;
  return amounts.gross;
}

// Progressive: each bracket's percent applies only to the slice of income inside it.
export function progressiveTax(income: number, brackets: Array<{ upTo: number | null; percent: number }>) {
  let tax = 0;
  let lower = 0;
  for (const { upTo, percent } of brackets) {
    const ceiling = upTo ?? Infinity;
    if (income <= lower) break;
    tax += (Math.min(income, ceiling) - lower) * (percent / 100);
    lower = ceiling;
  }
  return tax;
}

// FR-010: every rule type follows the salary's own proration. Flat amounts scale by the
// proration ratio; percentages apply to prorated pay; annual brackets annualize the full monthly
// base, then take the month's share and prorate it.
export function computeStatutoryAmount(rule: Rule, bases: Bases): number {
  switch (rule.ruleType) {
    case "FLAT":
      return round2(rule.ruleConfig.amount * bases.prorationRatio);
    case "PERCENTAGE": {
      const amount = pick(rule.ruleConfig.base, bases.prorated) * (rule.ruleConfig.percent / 100);
      return round2(rule.ruleConfig.cap !== undefined ? Math.min(amount, rule.ruleConfig.cap) : amount);
    }
    case "BRACKET": {
      const { base, period, brackets } = rule.ruleConfig;
      if (period === "MONTHLY") return round2(progressiveTax(pick(base, bases.prorated), brackets));
      const annual = progressiveTax(pick(base, bases.fullMonth) * 12, brackets);
      return round2((annual / 12) * bases.prorationRatio);
    }
  }
}
