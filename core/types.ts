// Core domain types for the SIXXAB autonomous business platform.

/** L1 Assist: agent drafts, a person does it. L2 Approve: agent does it after a person approves. L3 Autonomous: agent does it, person reviews in the briefing. */
export type AutonomyLevel = 1 | 2 | 3;

export type AgentLayer = 'core' | 'founder' | 'cxo' | 'department';

/** SIXXAB 6S stage number: 1 Startup … 6 SIXXAB. */
export type Stage = 1 | 2 | 3 | 4 | 5 | 6;

export type ModelTier = 'router' | 'worker' | 'planner';

export interface RoleCard {
  id: string;
  name: string;
  layer: AgentLayer;
  stage: Stage;
  reportsTo: string | null;
  job: string;
  modelTier: ModelTier;
  /** Tool names this agent may call. */
  tools: string[];
  instructions: string;
  /** Agents with no model (pure platform services) never run the LLM loop. */
  usesModel: boolean;
  /** A safe first task the owner can run from the Agents tab (and the admin proof run uses). */
  starter?: string;
}

/** Risk class drives defaults: money and external actions never start above L1/L2. */
export type TaskRisk = 'internal' | 'external' | 'money';

export interface TaskType {
  key: string;
  label: string;
  level: AutonomyLevel;
  risk: TaskRisk;
  /** Consecutive approvals with no edits before a promotion is proposed. */
  approvalsToPromote: number;
  /** Highest level this task may ever reach (money tasks are capped). */
  maxLevel: AutonomyLevel;
  /** Optional spend cap per action, in the org's currency minor units. */
  spendCapMinor?: number;
}

export type TaskStatus =
  | 'planned'
  | 'running'
  | 'awaiting_approval'
  | 'draft_for_human'
  | 'done'
  | 'rejected'
  | 'failed';

export interface PendingAction {
  tool: string;
  input: Record<string, unknown>;
  toolUseId: string;
  approvalId: string;
  /** Results already produced for earlier tool calls in the same model turn. */
  priorResults: ToolResultBlock[];
  /** Tool calls from the same model turn still to process after this one. */
  remaining: ToolUseBlock[];
}

export interface Task {
  id: string;
  orgId: string;
  agentId: string;
  goal: string;
  status: TaskStatus;
  /** Conversation so far, so a paused run can resume after approval. */
  transcript: ChatMessage[];
  pending: PendingAction | null;
  output: string | null;
  createdAt: string;
  updatedAt: string;
  parentTaskId: string | null;
}

export type ApprovalKind = 'approve' | 'draft';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Approval {
  id: string;
  orgId: string;
  taskId: string;
  kind: ApprovalKind;
  taskType: string;
  summary: string;
  proposed: Record<string, unknown>;
  status: ApprovalStatus;
  edited: Record<string, unknown> | null;
  reason: string | null;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface AuditEvent {
  id: string;
  orgId: string;
  at: string;
  actor: string;
  action: string;
  taskId: string | null;
  detail: Record<string, unknown>;
}

export interface Feedback {
  id: string;
  orgId: string;
  taskType: string;
  agentId: string;
  outcome: 'approved' | 'approved_with_edits' | 'rejected';
  reason: string | null;
  proposed: Record<string, unknown>;
  final: Record<string, unknown> | null;
  at: string;
}

export interface PromotionProposal {
  taskType: string;
  from: AutonomyLevel;
  to: AutonomyLevel;
  because: string;
}

export interface Memory {
  id: string;
  orgId: string;
  kind: 'fact' | 'decision' | 'outcome' | 'note';
  text: string;
  agentId: string | null;
  at: string;
}

export interface Briefing {
  orgId: string;
  date: string;
  shipped: string[];
  needsYou: string[];
  learned: string[];
  summary: string;
}

// ---- model I/O (Anthropic Messages API shape, trimmed) ----

export interface TextBlock { type: 'text'; text: string }
export interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
export interface ToolResultBlock { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** A tool the Claude API runs itself, such as web search; results come back inside the response. */
export interface ServerToolSpec { type: string; name: string; max_uses?: number }

export interface ModelRequest {
  tier: ModelTier;
  system: string;
  messages: ChatMessage[];
  tools?: (ToolSpec | ServerToolSpec)[];
  maxTokens?: number;
}

export interface ModelResponse {
  content: ContentBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | string;
  /** The model that answered, when the API reports it. */
  model?: string;
  /** Tokens billed for this call, when the API reports them. */
  usage?: { inputTokens: number; outputTokens: number; webSearches?: number };
}

export interface ModelClient {
  complete(req: ModelRequest): Promise<ModelResponse>;
}
