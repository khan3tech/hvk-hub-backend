import { describe, it, expect } from "vitest";
import { articleScore, keywordClassifier, mentionsSomeoneElse, splitQuestion, topicOf } from "./intents.js";

describe("assistant — classification", () => {
  const c = (q: string) => keywordClassifier.classify(q);
  it("routes common questions", () => {
    expect(c("how many sick days do I have left")).toBe("LEAVE_BALANCE");
    expect(c("what's my leave balance")).toBe("LEAVE_BALANCE");
    expect(c("how many annual leave days do we get per year")).toBe("LEAVE_ENTITLEMENT");
    expect(c("explain the PF deduction on my payslip")).toBe("PAYSLIP");
    expect(c("was my expense claim approved")).toBe("EXPENSE_STATUS");
    expect(c("status of my helpdesk ticket")).toBe("TICKET_STATUS");
    expect(c("when is the next public holiday")).toBe("HOLIDAYS");
    expect(c("what's our stance on remote work")).toBe("POLICY");
  });
});

describe("assistant — multi-part questions (FR-010)", () => {
  it("splits on joined questions", () => {
    expect(splitQuestion("what's my leave balance and what's our stance on remote work?")).toEqual(["what's my leave balance", "what's our stance on remote work"]);
    expect(splitQuestion("Explain my payslip. Also how many sick days do I have left?")).toHaveLength(2);
  });
  it("keeps a single question with 'and' inside intact", () => {
    expect(splitQuestion("show earnings and deductions on my payslip")).toEqual(["show earnings and deductions on my payslip"]);
  });
});

describe("assistant — other people's data (FR-003, US1.3)", () => {
  it("detects questions about someone else", () => {
    expect(mentionsSomeoneElse("what's Priya's salary")).toBe(true);
    expect(mentionsSomeoneElse("show the payslip of Rahul")).toBe(true);
    expect(mentionsSomeoneElse("what's my colleague's leave balance")).toBe(true);
    expect(mentionsSomeoneElse("how much did her claim pay out")).toBe(true);
  });
  it("leaves the asker's own questions alone", () => {
    expect(mentionsSomeoneElse("what's my leave balance")).toBe(false);
    expect(mentionsSomeoneElse("explain my payslip for March")).toBe(false);
    expect(mentionsSomeoneElse("what's today's net pay")).toBe(false);
  });
});

describe("assistant — topics and articles (FR-004, FR-007)", () => {
  it("labels topics without identity", () => {
    expect(topicOf("can I work from home on fridays", "POLICY")).toBe("remote work");
    expect(topicOf("what's my leave balance", "LEAVE_BALANCE")).toBe("leave balance");
    expect(topicOf("something unusual", "POLICY")).toBe("other");
  });
  it("matches articles only on a real overlap", () => {
    const a = { title: "Remote work policy", keywords: ["remote", "work from home"] };
    expect(articleScore("can I work from home?", a)).toBeGreaterThan(0);
    expect(articleScore("what's the dress code", a)).toBe(0);
  });
});
