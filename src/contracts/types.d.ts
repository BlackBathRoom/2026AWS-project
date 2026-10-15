/** UI接続用契約案v2。API経路と主要項目は仕様書05。
 * 05で未定義の配列ラッパー・画面用補助項目はAPI_CONTRACT.mdに列記。
 * 本番確定はBが版管理しA/B/Cで合意する。 */
export type Role='teacher'|'reviewer'|'manager'|'approver'|'admin';
export type Mode='learning'|'assessment';
export type Axes={K:number|null;P:number|null;E:number|null;D:number|null;L:number|null};
export type AidAction='GUIDANCE'|'HINT'|'EXAMPLE'|'EXPLANATION'|'ANSWER';
export type ErrorResponse={error:{code:string;message:string;request_id:string}};
export interface Policy {policy_version:number;ai_enabled:boolean;allow_answer:boolean;limits:{daily_jobs:number}}
export interface Me {user_id:string;role:Role;organization_id:string;cohort_ids:string[];policy_version:number;policy:Policy}
export interface Context {user:Me;params:Record<string,string>;query:Record<string,string>;body:Record<string,unknown>;idempotency_key?:string;request_id:string;spec_id:string}
export interface Choice {id:string;text:string}
export interface Citation {source_id:string;version:string|number;page:string|number;chunk_id:string}
export interface Lesson {lesson_id:string;title:string;content:string;source_refs:Citation[];approved_version:string|number|null;course_level:'I'|'II'|'TEACHING';fixture?:boolean}
export interface Quiz {attempt_id:string;root_attempt_id:string;question_id:string;version:number;prompt:string;choices:Choice[];reason:string;mode:Mode}
export interface AttemptInput {attempt_id:string;answer:string;response_time_ms:number}
export interface AttemptResult {result:{correct:boolean|null;explanation?:string};scored:boolean;mastery:number|null;confidence:string;next_action:string}
export interface Knowledge {unit_id:string;concept_id:string;score:number|null;confidence:string;sample_count:number;reasons:string[];weak_candidate:boolean;mastered:boolean;next_review_at:string|null}
export interface Competency {unit_id:string;axes:Axes;evidence_refs:string[];assessment_status:'ACHIEVED'|'NEEDS_IMPROVEMENT'|'UNMEASURED';assessment_id:string|null}
export interface Progress {knowledge:Knowledge[];competencies:Competency[]}
export interface TrainingPlanItem {unit_id:string;lesson_id:string;assignment_id:string;title:string;course_level:'I'|'II';session_id:string}
export interface Profile {profile_version:number;experience:string;target_units:string[];available_time:number;training_plan:TrainingPlanItem[]}
export interface Assignment {assignment_id:string;version:number;unit_id:string;title:string;rubric_version:string;mode:Mode;aid_policy:{ai_allowed:boolean;allow_answer:boolean};required_outputs:{key:string;label:string;description:string}[];rubric:Record<keyof Axes,string>;scale:Record<number,string>;my_submissions:Submission[];fixture?:boolean}
export interface Submission {submission_id:string;version:number;submission_version:number;assignment_id:string;assignment_version:number;unit_id:string;owner_id:string;organization_id:string;cohort_id:string;text:Record<string,string>;aid_declaration:string;file_refs:string[];status:'DRAFT'|'SUBMITTED';updated_at:string;submitted_at?:string}
export interface Review {assessment_id:string;version:number;status:'draft'|'final'|'superseded';submission_id:string;submission_version:number;rubric_version:string;unit_id:string;owner_id:string;organization_id:string;reviewer_id:string;axes:Axes;rationale:string;evidence_refs:string[];required_outputs_confirmed:boolean;finalized_at?:string;supersedes?:string}
export interface Appeal {appeal_id:string;assessment_id:string;submission_id:string;reason:string;reassigned_reviewer:string;status:'OPEN'|'RESOLVED';new_decision?:string}
export interface ReviewRow {submission:Submission;assignment:Assignment;reviews:Review[];appeals:Appeal[]}
export interface Page<T> {items:T[];next_cursor:string|null}
export interface JobInput {session_id:string;attempt_id?:string;assignment_id?:string;lesson_id?:string;question:string;requested_action:AidAction;draft_version?:number}
export interface AcceptedJob {job_id:string;status:'QUEUED'|'RUNNING';poll_after_ms:number}
export interface AIResult {status:'SUPPORTED'|'INSUFFICIENT'|'OUT_OF_SCOPE'|'ERROR'|'UNAVAILABLE';response_type:AidAction;message:string;citations:Citation[];next_action:string;reason_code:string}
export interface Job {job_id:string;status:'QUEUED'|'RUNNING'|'SUCCEEDED'|'FAILED'|'TIMEOUT';result?:AIResult}
export interface Upload {file_id?:string;upload_id?:string;presigned_url:string;expires_at:string;status?:string}
export interface StaticFile {file_id:string;filename:string;content:string;status:'CLEAN'}
export interface StudyContext {mode:Mode;purpose:string;concept_ids:string[];error_type:string|null;allow_answer:boolean;aid_policy:{ai_allowed:boolean;allow_answer:boolean};assignment_id:string;policy_version:number}
/** 正解を含む内部API-13専用。フロントエンドに送信しない。 */
export interface ApprovedQuestion {question_id:string;version:number;lesson_id:string;concept_id:string;prompt:string;choices:Choice[];answer:string;explanation:string;format:string;source_id:string;status:'APPROVED'}

/** EXT: account administration; production authorization belongs to B. */
export interface Account {user_id:string;display_name:string;email:string;role:Role;organization_id:string;cohort_ids:string[];active:boolean;status:'ACTIVE'|'INVITED'|'SUSPENDED'|'PENDING_APPROVAL'|'DELETION_PENDING';version:number;admin_scope:'PLATFORM'|null}
export interface AdminRequest {request_id:string;kind:'ACCOUNT_ROLE'|'ACCOUNT_COHORTS'|'AI_POLICY';target:string;requested_by:string;reason:string;status:'PENDING_APPROVAL'|'APPROVED'|'REJECTED';payload:Record<string,unknown>;decided_by?:string;decision_reason?:string}
