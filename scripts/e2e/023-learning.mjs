// specs/023-learning-development/quickstart.md, API side.
import { call, check, show, upload, PDF, RUN } from "./lib.mjs";

export default async function ({ tok, hire, department }) {
  const dept = await department(`Learning ${RUN}`);
  const ann = await hire(`LearnAnn ${RUN}`, "EMPLOYEE", { departmentId: dept.id });
  const bo = await hire(`LearnBo ${RUN}`, "EMPLOYEE", { departmentId: dept.id });

  // US1 — create and assign
  const course = await call("POST", "/learning/courses", { token: tok.hr, body: { title: `Git basics ${RUN}`, contentUrl: "https://learn.example.com/git" } });
  check("023 HR creates a course with an external link (FR-001)", course.status === 201 && course.json.contentUrl, show(course));
  const empCreate = await call("POST", "/learning/courses", { token: ann.token, body: { title: "Nope" } });
  check("023 employees can't manage courses", empCreate.status === 403, show(empCreate));
  const assigned = await call("POST", `/learning/courses/${course.json.id}/assign`, { token: tok.hr, body: { audience: "DEPARTMENT", departmentId: dept.id, dueDate: "2099-12-31" } });
  check("023 assign to a department (FR-002)", assigned.status === 201 && assigned.json.assigned === 2, show(assigned));
  const mine = await call("GET", "/learning/me", { token: ann.token });
  const a = mine.json.find?.((x) => x.course.id === course.json.id);
  check("023 assignee sees it incomplete with the due date (US1.1-2)", a?.status === "INCOMPLETE" && a.dueDate?.startsWith("2099-12-31"), show(mine));
  const late = await hire(`LearnLate ${RUN}`, "EMPLOYEE", { departmentId: dept.id });
  const lateMine = (await call("GET", "/learning/me", { token: late.token })).json;
  check("023 ordinary assignments aren't retroactive for new hires (US1.3)", Array.isArray(lateMine) && !lateMine.some((x) => x.course.id === course.json.id), JSON.stringify(lateMine));

  // US2 — completion
  const done = await call("POST", `/learning/assignments/${a.id}/complete`, { token: ann.token });
  check("023 employee marks it complete with a date (FR-003)", done.status === 200 && done.json.status === "COMPLETE" && done.json.completedAt, show(done));
  const boA = (await call("GET", "/learning/me", { token: bo.token })).json.find((x) => x.course.id === course.json.id);
  const notMine = await call("POST", `/learning/assignments/${boA.id}/complete`, { token: ann.token });
  check("023 can't complete someone else's assignment", notMine.status === 404, show(notMine));
  const hrView = await call("GET", `/learning/assignments?courseId=${course.json.id}&status=COMPLETE`, { token: tok.hr });
  check("023 HR tracking reflects the completion", hrView.json.length === 1 && hrView.json[0].employee.id === ann.id, show(hrView));

  const proofCourse = (await call("POST", "/learning/courses", { token: tok.hr, body: { title: `Forklift cert ${RUN}`, requiresProof: true } })).json;
  await call("POST", `/learning/courses/${proofCourse.id}/assign`, { token: tok.hr, body: { audience: "EMPLOYEES", employeeIds: [bo.id], dueDate: "2020-01-01" } });
  const proofA = (await call("GET", "/learning/me", { token: bo.token })).json.find((x) => x.course.id === proofCourse.id);
  const overdue = await call("GET", `/learning/assignments?courseId=${proofCourse.id}&status=OVERDUE`, { token: tok.hr });
  check("023 past due and incomplete is flagged overdue (FR-005)", proofA.status === "OVERDUE" && overdue.json.length === 1, show(overdue));
  const noProof = await call("POST", `/learning/assignments/${proofA.id}/complete`, { token: bo.token });
  check("023 proof required: no file, no completion (FR-004, SC-005)", noProof.status === 400 && noProof.json.error?.code === "PROOF_REQUIRED", show(noProof));
  const withProof = await upload(`/learning/assignments/${proofA.id}/complete`, { token: bo.token, file: PDF("forklift") });
  const docs = await call("GET", `/documents/employees/${bo.id}`, { token: tok.hr });
  check("023 completion with proof is stored as a document", withProof.status === 200 && withProof.json.proofDocumentId && docs.json.some?.((d) => d.id === withProof.json.proofDocumentId), `${show(withProof)} | ${show(docs)}`);

  // US3 — compliance
  const comp = (await call("POST", "/learning/courses", { token: tok.hr, body: { title: `Conduct ${RUN}`, isComplianceRequired: true } })).json;
  await call("POST", `/learning/courses/${comp.id}/assign`, { token: tok.hr, body: { audience: "DEPARTMENT", departmentId: dept.id, dueDate: "2020-01-01" } });
  const annComp = (await call("GET", "/learning/me", { token: ann.token })).json.find((x) => x.course.id === comp.id);
  await call("POST", `/learning/assignments/${annComp.id}/complete`, { token: ann.token });
  const newbie = await hire(`LearnNew ${RUN}`, "EMPLOYEE", { departmentId: dept.id });
  const newbieComp = (await call("GET", "/learning/me", { token: newbie.token })).json.find((x) => x.course.id === comp.id);
  check("023 new hires are enrolled in compliance courses, with a fresh due date (FR-007, SC-004)", newbieComp?.status === "INCOMPLETE", JSON.stringify(newbieComp));
  const dash = await call("GET", "/learning/compliance", { token: tok.hr });
  const row = dash.json.courses?.find((c) => c.courseId === comp.id);
  check("023 compliance dashboard: completed vs outstanding (FR-008)", row?.assigned === 4 && row.completed === 1 && row.outstanding === 3, show(dash));
  check("023 overdue compliance employees are flagged (US3.3)", row?.outstandingEmployees.filter((e) => e.overdue).length === 2 && row.outstandingEmployees.some((e) => e.employeeId === newbie.id && !e.overdue), JSON.stringify(row));
  await call("POST", `/employees/${bo.id}/offboard`, { token: tok.hr });
  const afterExit = (await call("GET", "/learning/compliance", { token: tok.hr })).json.courses.find((c) => c.courseId === comp.id);
  const boHistory = await call("GET", `/learning/assignments?employeeId=${bo.id}`, { token: tok.hr });
  check("023 offboarded employees leave the count; history kept (FR-009)", afterExit.assigned === 3 && boHistory.json.length === 3, `${JSON.stringify(afterExit)} | ${show(boHistory)}`);

  // Edge cases — refresher cycle and archiving
  const again = await call("POST", `/learning/courses/${course.json.id}/assign`, { token: tok.hr, body: { audience: "EMPLOYEES", employeeIds: [ann.id] } });
  const annCycles = (await call("GET", `/learning/assignments?employeeId=${ann.id}&courseId=${course.json.id}`, { token: tok.hr })).json;
  check("023 a completed course can be reassigned as a new cycle (FR-010)", again.json.assigned === 1 && annCycles.length === 2, JSON.stringify(annCycles));
  const archived = await call("POST", `/learning/courses/${course.json.id}/archive`, { token: tok.hr });
  const assignArchived = await call("POST", `/learning/courses/${course.json.id}/assign`, { token: tok.hr, body: { audience: "COMPANY" } });
  const kept = (await call("GET", "/learning/me", { token: ann.token })).json.filter((x) => x.course.id === course.json.id);
  check("023 archived courses can't be assigned; records kept (FR-009)", archived.json.archived === true && assignArchived.status === 409 && kept.length === 2, show(assignArchived));
}
