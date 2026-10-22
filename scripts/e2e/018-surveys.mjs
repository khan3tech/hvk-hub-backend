// specs/018-employee-engagement-surveys/quickstart.md, API side (+ a database-level anonymity check).
import { createRequire } from "node:module";
import { call, check, show, RUN } from "./lib.mjs";

export default async function ({ tok, hire, department }) {
  const dept = await department(`Pulse ${RUN}`);
  const team = [];
  for (let i = 0; i < 5; i++) team.push(await hire(`Pulse${i} ${RUN}`, "EMPLOYEE", { departmentId: dept.id }));
  const outsider = await hire(`Outside ${RUN}`);

  // US1
  const s = await call("POST", "/surveys", { token: tok.hr, body: { title: `Q4 pulse ${RUN}`, audienceType: "DEPARTMENT", departmentId: dept.id, questions: [{ type: "ENPS", prompt: "How likely are you to recommend working here?" }, { type: "TEXT", prompt: "What should we improve?" }] } });
  check("018 HR sends a department survey to 5 people (FR-001/002)", s.status === 201 && s.json.audienceSize === 5 && s.json.status === "OPEN", show(s));
  const noEnps = await call("POST", "/surveys", { token: tok.hr, body: { title: "x", audienceType: "COMPANY", questions: [{ type: "TEXT", prompt: "Anything?" }] } });
  check("018 a survey needs an eNPS question", noEnps.status === 400, show(noEnps));
  const pend = await call("GET", "/surveys/pending", { token: team[0].token });
  check("018 pending for the department", pend.json.some?.((p) => p.id === s.json.id), show(pend));
  const outPend = await call("GET", "/surveys/pending", { token: outsider.token });
  const outSubmit = await call("POST", `/surveys/${s.json.id}/responses`, { token: outsider.token, body: { answers: [{ questionId: s.json.questions[0].id, score: 1 }] } });
  check("018 not sent outside the department", !outPend.json.some((p) => p.id === s.json.id) && outSubmit.status === 404, show(outSubmit));
  const late = await hire(`PulseLate ${RUN}`, "EMPLOYEE", { departmentId: dept.id });
  check("018 later joiners don't get an already-sent survey (FR-010)", !(await call("GET", "/surveys/pending", { token: late.token })).json.some((p) => p.id === s.json.id), "");

  // US2
  const [q1, q2] = s.json.questions;
  const scores = [10, 9, 8, 6, 3];
  for (let i = 0; i < 4; i++) {
    await call("POST", `/surveys/${s.json.id}/responses`, { token: team[i].token, body: { answers: [{ questionId: q1.id, score: scores[i] }, { questionId: q2.id, text: `idea ${i}` }] } });
  }
  const again = await call("POST", `/surveys/${s.json.id}/responses`, { token: team[0].token, body: { answers: [{ questionId: q1.id, score: 0 }] } });
  check("018 a second response is refused (FR-004)", again.status === 409 && again.json.error?.code === "ALREADY_RESPONDED", show(again));
  const r4 = await call("GET", `/surveys/${s.json.id}/results`, { token: tok.admin });
  check("018 4 of 5 responses: results withheld even from Admin (FR-005, SC-004)", r4.json.withheld === true && !("questions" in r4.json), show(r4));
  await call("POST", `/surveys/${s.json.id}/responses`, { token: team[4].token, body: { answers: [{ questionId: q1.id, score: scores[4] }] } });
  const r5 = await call("GET", `/surveys/${s.json.id}/results`, { token: tok.hr });
  const enpsQ = r5.json.questions?.find((q) => q.type === "ENPS");
  check("018 at 5 responses: aggregated eNPS = promoters - detractors (FR-007)", r5.json.withheld === false && enpsQ.enps === 0 && r5.json.responseRate === 100, show(r5));
  check("018 open text shown anonymized (no ids/timestamps)", r5.json.questions.find((q) => q.type === "TEXT").texts.length === 4 && !JSON.stringify(r5.json).includes(team[0].id), "");
  check("018 pending clears after responding", !(await call("GET", "/surveys/pending", { token: team[0].token })).json.some((p) => p.id === s.json.id), "");

  // SC-003: inspect the database — no response row can be tied to a person.
  const require = createRequire(import.meta.url);
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient();
  try {
    const [parts, resps] = await Promise.all([
      db.surveyParticipation.findMany({ where: { surveyId: s.json.id } }),
      db.surveyResponse.findMany({ where: { surveyId: s.json.id } }),
    ]);
    const midnight = (d) => d.toISOString().endsWith("T00:00:00.000Z");
    const responseCols = Object.keys(resps[0] ?? {});
    check("018 DB: responses have no person column, random ids, day-only timestamps (FR-003, SC-003)",
      resps.length === 5 && !responseCols.some((c) => /employee|user/i.test(c)) && resps.every((r) => /^[0-9a-f-]{36}$/.test(r.id)) && resps.every((r) => midnight(r.submittedAt)) && parts.every((p) => midnight(p.respondedAt)),
      JSON.stringify(responseCols));
  } finally {
    await db.$disconnect();
  }

  // US3
  await call("POST", `/surveys/${s.json.id}/close`, { token: tok.hr });
  const trend = await call("GET", "/surveys/trend", { token: tok.hr });
  const row = trend.json.find?.((t) => t.surveyId === s.json.id);
  check("018 trend lists the closed survey with eNPS and response rate (FR-008/009)", row?.status === "CLOSED" && row.enps === 0 && row.responseRate === 100, JSON.stringify(row));
  const closedSubmit = await call("POST", `/surveys/${s.json.id}/responses`, { token: team[0].token, body: { answers: [{ questionId: q1.id, score: 5 }] } });
  check("018 closed survey takes no responses", closedSubmit.status === 409 || closedSubmit.status === 404, show(closedSubmit));
  const empTrend = await call("GET", "/surveys/trend", { token: tok.employee });
  check("018 survey admin/results are HR/Admin only", empTrend.status === 403, show(empTrend));
}
