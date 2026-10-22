// specs/020-public-careers-portal/quickstart.md, API side. Public calls carry no token.
import { createHash } from "node:crypto";
import { call, check, show, upload, download, PDF, RUN } from "./lib.mjs";

const ORG = "default";
const zeroBits = (buf) => { let n = 0; for (const b of buf) { if (b === 0) { n += 8; continue; } return n + Math.clz32(b) - 24; } return n; };
const solve = (c) => { for (let i = 0; ; i++) if (zeroBits(createHash("sha256").update(`${c.nonce}:${i}`).digest()) >= c.bits) return String(i); };

export default async function ({ tok }) {
  const dept = (await call("GET", "/departments", { token: tok.hr })).json[0];
  const p1 = (await call("POST", "/recruitment/postings", { token: tok.hr, body: { title: `Public Eng ${RUN}`, departmentId: dept.id, openings: 2, description: "Build great things." } })).json;
  const p2 = (await call("POST", "/recruitment/postings", { token: tok.hr, body: { title: `Public PM ${RUN}`, departmentId: dept.id, openings: 1 } })).json;
  const hold = (await call("POST", "/recruitment/postings", { token: tok.hr, body: { title: `On hold ${RUN}`, departmentId: dept.id, openings: 1 } })).json;
  await call("PATCH", `/recruitment/postings/${hold.id}`, { token: tok.hr, body: { status: "ON_HOLD" } });

  // US1
  const list = await call("GET", `/public/careers/${ORG}/postings`);
  const mine = list.json.find?.((p) => p.id === p1.id);
  check("020 public list shows open roles with department + description, no account (FR-001)", list.status === 200 && mine?.description === "Build great things." && mine.department === dept.name, show(list));
  check("020 on-hold roles are not listed (FR-002)", !list.json.some((p) => p.id === hold.id) && (await call("GET", `/public/careers/${ORG}/postings/${hold.id}`)).status === 404, "");
  check("020 unknown organization -> 404", (await call("GET", "/public/careers/no-such-org/postings")).status === 404, "");

  // Fetch challenges, wait out the minimum fill time once, solve them.
  const challenges = [];
  for (let i = 0; i < 6; i++) challenges.push((await call("GET", `/public/careers/${ORG}/challenge`)).json);
  await new Promise((r) => setTimeout(r, challenges[0].minFillMs + 200));
  const human = () => { const c = challenges.shift(); return { challenge: c.challenge, solution: solve(c) }; };
  const email = `applicant.${RUN}@example.com`;
  const fields = (extra = {}) => ({ name: "Ada Applicant", email, phone: "+91 98765 43210", ...human(), ...extra });

  // US2
  const noBot = await upload(`/public/careers/${ORG}/postings/${p1.id}/applications`, { fields: { name: "Bot", email: "bot@example.com" }, file: PDF("cv") });
  check("020 submissions without the bot check are refused (FR-007)", noBot.status === 400 && noBot.json.error?.code === "BOT_CHECK_FAILED", show(noBot));
  const app1 = await upload(`/public/careers/${ORG}/postings/${p1.id}/applications`, { fields: fields(), file: PDF("cv") });
  check("020 candidate applies without an account and gets a reference (FR-003, US2.3)", app1.status === 201 && /^TL-/.test(app1.json.reference ?? ""), show(app1));
  const pipeline = await call("GET", `/recruitment/postings/${p1.id}/applications`, { token: tok.hr });
  const inPipe = pipeline.json.find?.((a) => a.id === app1.json.applicationId);
  check("020 it enters HR's pipeline at APPLIED as PUBLIC (FR-004, SC-003)", inPipe?.stage === "APPLIED" && inPipe.source === "PUBLIC", JSON.stringify(inPipe));
  const dup = await upload(`/public/careers/${ORG}/postings/${p1.id}/applications`, { fields: fields(), file: PDF("cv") });
  check("020 duplicate application to the same role refused (FR-005, SC-004)", dup.status === 409 && dup.json.error?.code === "DUPLICATE_APPLICATION", show(dup));
  const app2 = await upload(`/public/careers/${ORG}/postings/${p2.id}/applications`, { fields: fields(), file: PDF("cv2") });
  check("020 same person, another role: tracked separately", app2.status === 201 && app2.json.applicationId !== app1.json.applicationId, show(app2));
  const exe = await upload(`/public/careers/${ORG}/postings/${p2.id}/applications`, { fields: fields({ email: `x.${RUN}@example.com` }), file: { bytes: Buffer.from("MZ"), name: "cv.exe", type: "application/x-msdownload" } });
  check("020 unsupported resume type rejected (FR-011)", exe.status === 415, show(exe));
  await call("PATCH", `/recruitment/postings/${p2.id}`, { token: tok.hr, body: { status: "CLOSED" } });
  const closed = await upload(`/public/careers/${ORG}/postings/${p2.id}/applications`, { fields: fields({ email: `late.${RUN}@example.com` }), file: PDF("cv") });
  check("020 role closed after the page loaded -> refused with explanation (FR-006)", closed.status === 409 && closed.json.error?.code === "POSTING_NOT_OPEN", show(closed));

  // US3
  const st = await call("POST", `/public/careers/${ORG}/status`, { body: { email, reference: app1.json.reference } });
  check("020 candidate checks status with email + reference (FR-008)", st.json.status === "Received" && st.json.final === false && st.json.posting === p1.title, show(st));
  await call("PATCH", `/recruitment/applications/${app1.json.applicationId}/stage`, { token: tok.hr, body: { stage: "REJECTED" } });
  const st2 = await call("POST", `/public/careers/${ORG}/status`, { body: { email, reference: app1.json.reference } });
  check("020 terminal outcome stated clearly", st2.json.status === "Not selected" && st2.json.final === true, show(st2));
  const wrongEmail = await call("POST", `/public/careers/${ORG}/status`, { body: { email: "someone@else.com", reference: app1.json.reference } });
  const wrongRef = await call("POST", `/public/careers/${ORG}/status`, { body: { email, reference: "TL-000000000000" } });
  check("020 mismatches get one generic answer (FR-009, SC-005)", wrongEmail.status === 404 && wrongRef.status === 404 && wrongEmail.json.error.message === wrongRef.json.error.message, `${show(wrongEmail)} | ${show(wrongRef)}`);

  // FR-010: data removal on request
  const candidateId = (await call("GET", `/recruitment/applications/${app1.json.applicationId}`, { token: tok.hr })).json.candidateId;
  const resumeUrl = (await call("GET", `/recruitment/candidates/${candidateId}`, { token: tok.hr })).json.resumeUrl;
  check("020 resume stored as the candidate's document", /^\/api\/documents\/[\w-]+\/download$/.test(resumeUrl ?? ""), resumeUrl);
  const del = await call("DELETE", `/recruitment/candidates/${candidateId}`, { token: tok.hr });
  const gone = await call("GET", `/recruitment/candidates/${candidateId}`, { token: tok.hr });
  const resume = await download(resumeUrl.replace(/^\/api/, ""), tok.hr);
  const st3 = await call("POST", `/public/careers/${ORG}/status`, { body: { email, reference: app1.json.reference } });
  check("020 HR deletes the candidate with applications and resume (FR-010)", del.status === 204 && gone.status === 404 && resume.status === 404 && st3.status === 404, `${del.status}/${gone.status}/${resume.status}/${st3.status}`);
}
