// Thin REST client for the admin + recruiter endpoints on the api-gateway.
// Every request carries the admin Bearer token. A 401 clears the session and
// bounces to /login.
import { getToken, logout } from './auth';

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const resp = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (resp.status === 401) {
    logout();
    window.location.href = '/login';
    throw new Error('Session expired. Please sign in again.');
  }

  const text = await resp.text();
  const data = text ? safeJson(text) : null;

  if (!resp.ok) {
    const msg =
      (data && (data.error || data.message)) || `Request failed (${resp.status})`;
    throw new Error(msg);
  }
  return data as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  course_ids: string[];
  created_at: string;
}

export interface ListUsersResponse {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ImportUserRow {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role?: string;
  course_ids?: string[];
}

export interface ImportRowResult {
  email: string;
  success: boolean;
  message: string;
  /** Whether a welcome email was actually dispatched to this address. */
  emailed?: boolean;
  /** True for a newly created account, false for one that already existed. */
  is_new_user?: boolean;
}

export interface BulkImportResponse {
  total: number;
  success: number;
  failed: number;
  results: ImportRowResult[];
}

// ─── Users (admin) ──────────────────────────────────────────────────────────

export const listUsers = (page = 1, pageSize = 50, search = '') =>
  request<ListUsersResponse>(
    'GET',
    `/api/admin/users?page=${page}&page_size=${pageSize}&search=${encodeURIComponent(search)}`,
  );

export const bulkImport = (users: ImportUserRow[], sendWelcome = false) =>
  request<BulkImportResponse>('POST', '/api/admin/bulk-import', {
    users,
    send_welcome: sendWelcome,
  });

export const updateUserRole = (id: string, role: string) =>
  request<{ success: boolean }>('PATCH', `/api/admin/users/${id}`, { role });

export interface UserPatch {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
}

// Only the provided fields are changed server-side. Phone is written to the
// profile row; name/email/role to the users row.
export const updateUser = (id: string, patch: UserPatch) =>
  request<{ success: boolean }>('PATCH', `/api/admin/users/${id}`, patch);

export const deleteUser = (id: string) =>
  request<{ success: boolean }>('DELETE', `/api/admin/users/${id}`);

export const grantCourse = (id: string, courseId: string) =>
  request<{ success: boolean }>('POST', `/api/admin/users/${id}/courses`, {
    course_id: courseId,
  });

export const revokeCourse = (id: string, courseId: string) =>
  request<{ success: boolean }>(
    'DELETE',
    `/api/admin/users/${id}/courses/${encodeURIComponent(courseId)}`,
  );

// ─── Enquiries (marketing-site contact form leads) ──────────────────────────

export interface Inquiry {
  id: string;
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  interest: string;
  message: string;
  source: string;
  page_url: string;
  status: string; // new | contacted | closed
  notes: string;
  created_at: string;
}

export interface ListInquiriesResponse {
  inquiries: Inquiry[];
  total: number;
  page: number;
  pageSize: number;
}

export const listInquiries = (page = 1, pageSize = 25, status = '', search = '') => {
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) q.set('status', status);
  if (search) q.set('search', search);
  return request<ListInquiriesResponse>('GET', `/api/admin/inquiries?${q.toString()}`);
};

export const updateInquiry = (id: string, patch: { status?: string; notes?: string }) =>
  request<{ success: boolean }>('PATCH', `/api/admin/inquiries/${id}`, patch);

// ─── Course catalog ─────────────────────────────────────────────────────────

export interface CourseDto {
  id: string;
  name: string;
}

export const fetchCourses = () =>
  request<{ courses: CourseDto[] }>('GET', '/api/admin/courses');

// ─── Assessments / tests (recruiter API; admin passes the guard) ────────────

export interface McqOption {
  id?: string;
  body: string;
  is_correct?: boolean;
  order_index: number;
}

export interface McqQuestion {
  id?: string;
  company_id?: string;
  topic: string;
  difficulty: string; // Easy | Medium | Hard
  body: string;
  kind: string; // single | multiple | numeric
  explanation?: string;
  is_active: boolean;
  options: McqOption[];
}

export interface SectionQuestion {
  id?: string;
  section_id?: string;
  mcq_question_id?: string;
  problem_id?: string;
  marks: number;
  order_index: number;
  title?: string;
  difficulty?: string;
}

export interface Section {
  id?: string;
  assessment_id?: string;
  title: string;
  kind: string; // mcq | coding | descriptive
  order_index: number;
  duration_minutes?: number;
  cutoff_marks?: number;
  questions?: SectionQuestion[];
}

export interface Assessment {
  id?: string;
  company_id?: string;
  title: string;
  description?: string;
  purpose?: string; // practice | hiring | scholarship
  duration_minutes: number;
  total_marks?: number;
  passing_marks?: number;
  negative_marking?: number;
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
  allow_backtrack?: boolean;
  /** Reveal the paper one question at a time; the next unlocks once this one is answered. */
  lock_forward?: boolean;
  reveal_results?: boolean;
  status?: string; // draft | published | archived
  max_attempts?: number;
  sections?: Section[];
  question_count?: number;
  attempt_count?: number;
  created_at?: string;
}

export const listAssessments = (params = '') =>
  request<{ assessments: Assessment[]; total: number }>(
    'GET',
    `/api/recruiter/assessments${params ? `?${params}` : ''}`,
  );

export const createAssessment = (a: Assessment) =>
  request<{ id: string }>('POST', '/api/recruiter/assessments', a);

export const getAssessment = (id: string) =>
  request<Assessment>('GET', `/api/recruiter/assessments/${id}`);

export const updateAssessment = (id: string, a: Assessment) =>
  request<unknown>('PATCH', `/api/recruiter/assessments/${id}`, a);

export const deleteAssessment = (id: string) =>
  request<unknown>('DELETE', `/api/recruiter/assessments/${id}`);

export const publishAssessment = (id: string, publish: boolean) =>
  request<unknown>('POST', `/api/recruiter/assessments/${id}/publish`, {
    publish,
  });

export const upsertSection = (assessmentId: string, s: Section) =>
  request<{ id: string }>(
    'POST',
    `/api/recruiter/assessments/${assessmentId}/sections`,
    s,
  );

export const deleteSection = (assessmentId: string, sectionId: string) =>
  request<unknown>(
    'DELETE',
    `/api/recruiter/assessments/${assessmentId}/sections/${sectionId}`,
  );

export const setSectionQuestions = (
  assessmentId: string,
  sectionId: string,
  questions: SectionQuestion[],
) =>
  request<unknown>(
    'PUT',
    `/api/recruiter/assessments/${assessmentId}/sections/${sectionId}/questions`,
    { questions },
  );

// ─── Coding problems (problem-service, via GraphQL) ─────────────────────────

export interface ProblemSummary {
  id: string;
  title: string;
  difficulty: string;
}

async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch('/api/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const body = await resp.json();
  if (body.errors?.length) throw new Error(body.errors[0].message || 'GraphQL error');
  return body.data as T;
}

export async function listProblems(search = ''): Promise<ProblemSummary[]> {
  const data = await graphql<{ listProblems: { problems: ProblemSummary[] } }>(
    `query($pageSize: Int){ listProblems(pageSize: $pageSize){ problems { id title difficulty } } }`,
    { pageSize: 300 },
  );
  const all = data.listProblems?.problems || [];
  const v = search.trim().toLowerCase();
  return v ? all.filter((p) => p.title.toLowerCase().includes(v)) : all;
}

// ─── MCQ bank ────────────────────────────────────────────────────────────────

export const listMcq = (params = '') =>
  request<{ questions: McqQuestion[]; total: number }>(
    'GET',
    `/api/recruiter/mcq-bank${params ? `?${params}` : ''}`,
  );

export const upsertMcq = (q: McqQuestion) =>
  request<{ id: string }>('POST', '/api/recruiter/mcq-bank', q);

export const deleteMcq = (id: string) =>
  request<unknown>('DELETE', `/api/recruiter/mcq-bank/${id}`);

export const importMcq = (questions: McqQuestion[]) =>
  request<{ imported: number }>('POST', '/api/recruiter/mcq-bank/import', {
    questions,
  });

// ─── Results ─────────────────────────────────────────────────────────────────

export interface AttemptSummary {
  id?: string;
  assessment_id?: string;
  user_name?: string;
  user_email?: string;
  attempt_no?: number;
  status?: string;
  started_at?: string;
  submitted_at?: string;
  score?: number;
  max_score?: number;
  percent?: number;
  passed?: boolean;
}

export const listAttempts = (assessmentId: string) =>
  request<{ attempts: AttemptSummary[]; total?: number }>(
    'GET',
    `/api/recruiter/assessments/${assessmentId}/attempts`,
  );

// The export endpoint needs the Bearer token, so we fetch it as a blob and
// trigger a client-side download rather than navigating to a bare URL.
export async function downloadResultsCsv(
  assessmentId: string,
  filename: string,
): Promise<void> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(
    `/api/recruiter/assessments/${assessmentId}/export.csv`,
    { headers },
  );
  if (!resp.ok) throw new Error(`Export failed (${resp.status})`);

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Scholarship ──────────────────────────────────────────────────────────────

export interface ScholarshipApplication {
  id: string;
  name: string;
  email: string;
  phone: string;
  course_id: string;
  course_name: string;
  qualification: string;
  college: string;
  graduation_year: number | null;
  city: string;
  /** Derived from the candidate's attempt, not stored — see the gateway handler. */
  status: string;
  attempt_id: string;
  score: number | null;
  max_score: number | null;
  percentage: number | null;
  award_percent: number | null;
  notes: string;
  created_at: string;
}

export interface ListScholarshipsResponse {
  applications: ScholarshipApplication[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AwardSlab {
  minPercent: number;
  awardPercent: number;
}

export interface ScholarshipProgram {
  id: string;
  course_id: string;
  course_name: string;
  assessment_id: string;
  assessment_title: string;
  /** 'missing' when the mapped assessment no longer exists. */
  assessment_status: string;
  is_active: boolean;
  opens_at?: string;
  closes_at?: string;
  seats: number;
  used: number;
  award_slabs: AwardSlab[];
}

export interface ScholarshipFilters {
  status?: string;
  courseId?: string;
  search?: string;
  minPercent?: string;
}

function scholarshipQuery(f: ScholarshipFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (f.status) q.set('status', f.status);
  if (f.courseId) q.set('courseId', f.courseId);
  if (f.search) q.set('search', f.search);
  if (f.minPercent) q.set('minPercent', f.minPercent);
  return q;
}

export const listScholarships = (page = 1, pageSize = 25, f: ScholarshipFilters = {}) => {
  const q = scholarshipQuery(f);
  q.set('page', String(page));
  q.set('pageSize', String(pageSize));
  return request<ListScholarshipsResponse>('GET', `/api/admin/scholarships?${q}`);
};

export const updateScholarship = (
  id: string,
  patch: { status?: string; award_percent?: number | null; notes?: string },
) => request<{ success: boolean }>('PATCH', `/api/admin/scholarships/${id}`, patch);

/**
 * Downloads the CSV for whatever the screen is currently filtered to.
 *
 * It cannot be a plain link: the endpoint needs the Bearer token, and an <a>
 * carries no headers. So the file is fetched, turned into an object URL and
 * clicked — and the URL is revoked afterwards so the blob is not held for the
 * life of the tab.
 */
export async function exportScholarshipsCsv(f: ScholarshipFilters = {}): Promise<void> {
  const token = getToken();
  const resp = await fetch(`/api/admin/scholarships/export.csv?${scholarshipQuery(f)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (resp.status === 401) {
    logout();
    window.location.href = '/login';
    throw new Error('Session expired. Please sign in again.');
  }
  if (!resp.ok) throw new Error(`Export failed (${resp.status})`);

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scholarship-applications-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const listScholarshipPrograms = () =>
  request<{ programs: ScholarshipProgram[] }>('GET', '/api/admin/scholarship-programs');

export const upsertScholarshipProgram = (p: {
  course_id: string;
  course_name: string;
  assessment_id: string;
  is_active?: boolean;
  opens_at?: string;
  closes_at?: string;
  seats?: number;
  award_slabs?: AwardSlab[];
}) => request<{ success: boolean; id: string }>('POST', '/api/admin/scholarship-programs', p);

export interface ResendResult {
  /** False when the relay refused the message. The link is still valid. */
  success: boolean;
  email: string;
  /** The freshly issued link. Shown to staff so a broken mailbox is not a dead end. */
  testUrl: string;
  expires: string;
  /** Why the send failed, when it did. */
  emailError?: string;
}

/**
 * Issues a new test link and emails it again.
 *
 * The old link stops working — this is a reissued credential, not a copy of the
 * previous one — which is also what makes it the fix for an expired link rather
 * than only a lost one.
 */
export const resendScholarshipLink = (id: string) =>
  request<ResendResult>('POST', `/api/admin/scholarships/${id}/resend`);

/**
 * Removes an application, its invitation and any attempt at that paper.
 *
 * The candidate's account only goes with it when this funnel created it and
 * nothing else depends on it — a scholarship applicant is often a real student
 * with courses, and their account is not a by-product of this row.
 */
export const deleteScholarship = (id: string) =>
  request<{ success: boolean; email: string; accountRemoved: boolean }>(
    'DELETE',
    `/api/admin/scholarships/${id}`,
  );

/**
 * Turns an applicant into a student and grants the course they applied for.
 *
 * Deliberately a separate, manual step: passing the test is not enrolment — the
 * fee still has to be paid, and only a person knows whether it has been.
 */
export const enrolScholarshipApplicant = (id: string) =>
  request<{ success: boolean; email: string; courseName: string }>(
    'POST',
    `/api/admin/scholarships/${id}/enrol`,
  );
