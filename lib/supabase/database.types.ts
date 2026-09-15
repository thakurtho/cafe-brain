/**
 * Hand-authored to match the shape `supabase gen types typescript` produces,
 * transcribed directly from supabase/migrations/*.sql. Accurate as of that
 * migration set — once the CLI is linked to the live project, regenerate
 * for real and this file becomes the drop-in replacement:
 *
 *   npx supabase login
 *   npx supabase gen types typescript --project-id <your-project-ref> --schema public > lib/supabase/database.types.ts
 *
 * Until then, keep this file in sync by hand whenever a migration changes
 * a table shape.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ---------------------------------------------------------------------
// Enums (supabase/migrations/20260911140000_extensions_and_enums.sql)
// ---------------------------------------------------------------------

export type AccessTier = "floor_staff" | "shift_manager" | "outlet_manager" | "gm_owner";
export type ApprovalStatus = "draft" | "pending" | "approved" | "rejected";
export type SessionMode = "ask" | "tell";
export type SessionInitiator = "BIC" | "UIC";
export type SessionStatus = "open" | "closed";
export type MessageSender = "user" | "assistant" | "system";
export type ClassificationType =
  | "observation" // unused going forward — collapsed into "log" (v4 rebuild)
  | "fyi" // unused going forward — collapsed into "log" (v4 rebuild)
  | "task_request"
  | "pattern" // unused going forward — patterns now come from an async scan, not per-session classification
  | "incident"
  | "log"
  | "judgment_call"
  | "none";
export type SubjectTag =
  | "customer"
  | "vendor"
  | "staff_colleague"
  | "equipment_machine"
  | "recipe_menu"
  | "inventory_stock"
  | "facility_premises"
  | "process_sop"
  | "finance_billing"
  | "compliance_safety"
  | "schedule_roster"
  | "competitor_market";
export type TaskStatus = "pending_approval" | "approved" | "in_progress" | "done" | "rejected" | "blocked";
export type CompletionMode = "manual" | "auto";
export type IncidentStatus = "open" | "resolved";
export type IncidentResponseType = "floor_handles" | "manager_must_engage";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type WastageStatus = "pending_approval" | "approved" | "rejected";
export type PosPermissionMode = "direct" | "requires_manager_approval";
export type KnowledgeGapEscalationLevel = "outlet_manager" | "domain_owner" | "brand";
export type KnowledgeGapStatus = "open" | "escalated" | "resolved";
export type ChecklistCategory = "opening" | "closing" | "general";
export type ProofType = "photo" | "reading" | "voice" | "confirm"; // checklist_items only
export type TaskProofType = "text" | "photo" | "video" | "audio"; // tasks only — a separate, diverging vocabulary
export type ShiftSwapStatus = "pending" | "approved" | "rejected";
export type TaskCompletionStatus = "pending_review" | "accepted" | "rejected";
export type ComplianceStatus = "upcoming" | "overdue" | "cleared";

export interface Database {
  public: {
    Tables: {
      brands: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      outlets: {
        Row: {
          id: string; brand_id: string; name: string; location: string | null;
          auto_archive_done_after_days: number | null; created_at: string;
        };
        Insert: {
          id?: string; brand_id: string; name: string; location?: string | null;
          auto_archive_done_after_days?: number | null; created_at?: string;
        };
        Update: {
          id?: string; brand_id?: string; name?: string; location?: string | null;
          auto_archive_done_after_days?: number | null; created_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string; brand_id: string; outlet_id: string | null; name: string; phone: string;
          email: string | null; role: string; access_tier: AccessTier; language_preference: string;
          created_at: string;
        };
        Insert: {
          id: string; brand_id: string; outlet_id?: string | null; name: string; phone: string;
          email?: string | null; role: string; access_tier: AccessTier; language_preference?: string;
          created_at?: string;
        };
        Update: {
          id?: string; brand_id?: string; outlet_id?: string | null; name?: string; phone?: string;
          email?: string | null; role?: string; access_tier?: AccessTier; language_preference?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      org_positions: {
        Row: {
          id: string; outlet_id: string; role_title: string; reports_to_position_id: string | null;
          filled_by: string | null; level: number; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; role_title: string; reports_to_position_id?: string | null;
          filled_by?: string | null; level: number; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; role_title?: string; reports_to_position_id?: string | null;
          filled_by?: string | null; level?: number; created_at?: string;
        };
        Relationships: [];
      };
      menu_items: {
        Row: { id: string; outlet_id: string; name: string; category: string; price: number | null; created_at: string };
        Insert: { id?: string; outlet_id: string; name: string; category: string; price?: number | null; created_at?: string };
        Update: { id?: string; outlet_id?: string; name?: string; category?: string; price?: number | null; created_at?: string };
        Relationships: [];
      };
      machines: {
        Row: { id: string; outlet_id: string; name: string; type: string | null; installed_on: string | null; created_at: string };
        Insert: { id?: string; outlet_id: string; name: string; type?: string | null; installed_on?: string | null; created_at?: string };
        Update: { id?: string; outlet_id?: string; name?: string; type?: string | null; installed_on?: string | null; created_at?: string };
        Relationships: [];
      };
      customers: {
        Row: { id: string; outlet_id: string; name: string; phone: string | null; preferences: string | null; created_at: string };
        Insert: { id?: string; outlet_id: string; name: string; phone?: string | null; preferences?: string | null; created_at?: string };
        Update: { id?: string; outlet_id?: string; name?: string; phone?: string | null; preferences?: string | null; created_at?: string };
        Relationships: [];
      };
      vendors: {
        Row: { id: string; outlet_id: string; name: string; category: string | null; supplies: string | null; created_at: string };
        Insert: { id?: string; outlet_id: string; name: string; category?: string | null; supplies?: string | null; created_at?: string };
        Update: { id?: string; outlet_id?: string; name?: string; category?: string | null; supplies?: string | null; created_at?: string };
        Relationships: [];
      };
      recipes: {
        Row: {
          id: string; outlet_id: string; menu_item_id: string; ingredients: Json | null; steps: string | null;
          owner_id: string | null; version: number; status: ApprovalStatus; approved_by: string | null;
          approved_at: string | null; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; menu_item_id: string; ingredients?: Json | null; steps?: string | null;
          owner_id?: string | null; version?: number; status?: ApprovalStatus; approved_by?: string | null;
          approved_at?: string | null; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; menu_item_id?: string; ingredients?: Json | null; steps?: string | null;
          owner_id?: string | null; version?: number; status?: ApprovalStatus; approved_by?: string | null;
          approved_at?: string | null; created_at?: string;
        };
        Relationships: [];
      };
      recipe_variants: {
        Row: {
          id: string; base_recipe_id: string; outlet_id: string; description: string; submitted_by: string | null;
          source_session_id: string | null; status: ApprovalStatus; approved_by: string | null;
          approved_at: string | null; is_standing_option: boolean; created_at: string;
        };
        Insert: {
          id?: string; base_recipe_id: string; outlet_id: string; description: string; submitted_by?: string | null;
          source_session_id?: string | null; status?: ApprovalStatus; approved_by?: string | null;
          approved_at?: string | null; is_standing_option?: boolean; created_at?: string;
        };
        Update: {
          id?: string; base_recipe_id?: string; outlet_id?: string; description?: string; submitted_by?: string | null;
          source_session_id?: string | null; status?: ApprovalStatus; approved_by?: string | null;
          approved_at?: string | null; is_standing_option?: boolean; created_at?: string;
        };
        Relationships: [];
      };
      sops: {
        Row: {
          id: string; outlet_id: string; topic: string; linked_machine_id: string | null; content: string | null;
          owner_id: string | null; pending_edit_content: string | null; edit_source: string | null; version: number;
          status: ApprovalStatus; approved_by: string | null; approved_at: string | null; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; topic: string; linked_machine_id?: string | null; content?: string | null;
          owner_id?: string | null; pending_edit_content?: string | null; edit_source?: string | null; version?: number;
          status?: ApprovalStatus; approved_by?: string | null; approved_at?: string | null; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; topic?: string; linked_machine_id?: string | null; content?: string | null;
          owner_id?: string | null; pending_edit_content?: string | null; edit_source?: string | null; version?: number;
          status?: ApprovalStatus; approved_by?: string | null; approved_at?: string | null; created_at?: string;
        };
        Relationships: [];
      };
      training_modules: {
        Row: {
          id: string; outlet_id: string; title: string; content: string | null; linked_menu_item_id: string | null;
          linked_machine_id: string | null; owner_id: string | null; pending_edit_content: string | null;
          edit_source: string | null; version: number; status: ApprovalStatus; approved_by: string | null;
          approved_at: string | null; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; title: string; content?: string | null; linked_menu_item_id?: string | null;
          linked_machine_id?: string | null; owner_id?: string | null; pending_edit_content?: string | null;
          edit_source?: string | null; version?: number; status?: ApprovalStatus; approved_by?: string | null;
          approved_at?: string | null; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; title?: string; content?: string | null; linked_menu_item_id?: string | null;
          linked_machine_id?: string | null; owner_id?: string | null; pending_edit_content?: string | null;
          edit_source?: string | null; version?: number; status?: ApprovalStatus; approved_by?: string | null;
          approved_at?: string | null; created_at?: string;
        };
        Relationships: [];
      };
      checklist_items: {
        Row: {
          id: string; outlet_id: string; title: string; linked_sop_id: string | null; proof_type: ProofType;
          required: boolean; category: ChecklistCategory; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; title: string; linked_sop_id?: string | null; proof_type: ProofType;
          required?: boolean; category: ChecklistCategory; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; title?: string; linked_sop_id?: string | null; proof_type?: ProofType;
          required?: boolean; category?: ChecklistCategory; created_at?: string;
        };
        Relationships: [];
      };
      training_progress: {
        Row: {
          id: string; outlet_id: string; user_id: string; training_module_id: string; status: string;
          completed_at: string | null; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; user_id: string; training_module_id: string; status?: string;
          completed_at?: string | null; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; user_id?: string; training_module_id?: string; status?: string;
          completed_at?: string | null; created_at?: string;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string; outlet_id: string; user_id: string | null; initiated_by: SessionInitiator; mode: SessionMode;
          status: SessionStatus; started_at: string; closed_at: string | null; flagged: boolean;
          flag_reason: string | null; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; user_id?: string | null; initiated_by: SessionInitiator; mode: SessionMode;
          status?: SessionStatus; started_at?: string; closed_at?: string | null; flagged?: boolean;
          flag_reason?: string | null; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; user_id?: string | null; initiated_by?: SessionInitiator; mode?: SessionMode;
          status?: SessionStatus; started_at?: string; closed_at?: string | null; flagged?: boolean;
          flag_reason?: string | null; created_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: { id: string; session_id: string; sender: MessageSender; text: string | null; media_url: string | null; created_at: string };
        Insert: { id?: string; session_id: string; sender: MessageSender; text?: string | null; media_url?: string | null; created_at?: string };
        Update: { id?: string; session_id?: string; sender?: MessageSender; text?: string | null; media_url?: string | null; created_at?: string };
        Relationships: [];
      };
      session_classifications: {
        Row: {
          id: string; session_id: string; classified_as: ClassificationType; resulting_id: string | null;
          confidence: number | null; created_at: string;
        };
        Insert: {
          id?: string; session_id: string; classified_as: ClassificationType; resulting_id?: string | null;
          confidence?: number | null; created_at?: string;
        };
        Update: {
          id?: string; session_id?: string; classified_as?: ClassificationType; resulting_id?: string | null;
          confidence?: number | null; created_at?: string;
        };
        Relationships: [];
      };
      logs: {
        Row: {
          id: string; outlet_id: string; source_session_id: string | null; subject: SubjectTag | null;
          entity_type: string | null; entity_id: string | null; summary: string; archived: boolean; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; source_session_id?: string | null; subject?: SubjectTag | null;
          entity_type?: string | null; entity_id?: string | null; summary: string; archived?: boolean; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; source_session_id?: string | null; subject?: SubjectTag | null;
          entity_type?: string | null; entity_id?: string | null; summary?: string; archived?: boolean; created_at?: string;
        };
        Relationships: [];
      };
      inventory_items: {
        Row: { id: string; outlet_id: string; name: string; created_at: string };
        Insert: { id?: string; outlet_id: string; name: string; created_at?: string };
        Update: { id?: string; outlet_id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      facility_areas: {
        Row: { id: string; outlet_id: string; name: string; created_at: string };
        Insert: { id?: string; outlet_id: string; name: string; created_at?: string };
        Update: { id?: string; outlet_id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      patterns: {
        Row: {
          id: string; outlet_id: string; entity_type: string | null; entity_id: string | null;
          observation_ids: string[]; summary: string; proposed_action: string | null; status: ApprovalStatus;
          approved_by: string | null; approved_at: string | null; brand_visible: boolean; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; entity_type?: string | null; entity_id?: string | null;
          observation_ids?: string[]; summary: string; proposed_action?: string | null; status?: ApprovalStatus;
          approved_by?: string | null; approved_at?: string | null; brand_visible?: boolean; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; entity_type?: string | null; entity_id?: string | null;
          observation_ids?: string[]; summary?: string; proposed_action?: string | null; status?: ApprovalStatus;
          approved_by?: string | null; approved_at?: string | null; brand_visible?: boolean; created_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string; outlet_id: string; source_session_id: string | null; source_log_id: string | null;
          source_insight_id: string | null; description: string; status: TaskStatus; assigned_to: string | null;
          created_by: string | null; self_assigned: boolean; approved_by: string | null; approved_at: string | null;
          handover_reason: string | null; handover_session_id: string | null; requires_proof: boolean;
          completion_mode: CompletionMode; auto_close_entity_type: string | null; auto_close_entity_id: string | null;
          due_date: string; resolution_note: string | null; archived: boolean;
          proof_media_path: string | null; proof_type: TaskProofType | null; proof_value: string | null;
          source_pattern_id: string | null; source_incident_id: string | null; completed_at: string | null;
          source_compliance_id: string | null; extension_requested: boolean;
          requested_due_date: string | null; extension_reason: string | null;
          completion_status: TaskCompletionStatus | null; completion_reviewed_by: string | null;
          completion_reviewed_at: string | null; rejection_reason: string | null;
          reopened_from_completion_id: string | null; subject: SubjectTag | null;
          created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; source_session_id?: string | null; source_log_id?: string | null;
          source_insight_id?: string | null; description: string; status?: TaskStatus; assigned_to?: string | null;
          created_by?: string | null; self_assigned?: boolean; approved_by?: string | null; approved_at?: string | null;
          handover_reason?: string | null; handover_session_id?: string | null; requires_proof?: boolean;
          completion_mode?: CompletionMode; auto_close_entity_type?: string | null; auto_close_entity_id?: string | null;
          due_date: string; resolution_note?: string | null; archived?: boolean;
          proof_media_path?: string | null; proof_type?: TaskProofType | null; proof_value?: string | null;
          source_pattern_id?: string | null; source_incident_id?: string | null; completed_at?: string | null;
          source_compliance_id?: string | null; extension_requested?: boolean;
          requested_due_date?: string | null; extension_reason?: string | null;
          completion_status?: TaskCompletionStatus | null; completion_reviewed_by?: string | null;
          completion_reviewed_at?: string | null; rejection_reason?: string | null;
          reopened_from_completion_id?: string | null; subject?: SubjectTag | null;
          created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; source_session_id?: string | null; source_log_id?: string | null;
          source_insight_id?: string | null; description?: string; status?: TaskStatus; assigned_to?: string | null;
          created_by?: string | null; self_assigned?: boolean; approved_by?: string | null; approved_at?: string | null;
          handover_reason?: string | null; handover_session_id?: string | null; requires_proof?: boolean;
          completion_mode?: CompletionMode; auto_close_entity_type?: string | null; auto_close_entity_id?: string | null;
          due_date?: string; resolution_note?: string | null; archived?: boolean;
          proof_media_path?: string | null; proof_type?: TaskProofType | null; proof_value?: string | null;
          source_pattern_id?: string | null; source_incident_id?: string | null; completed_at?: string | null;
          source_compliance_id?: string | null; extension_requested?: boolean;
          requested_due_date?: string | null; extension_reason?: string | null;
          completion_status?: TaskCompletionStatus | null; completion_reviewed_by?: string | null;
          completion_reviewed_at?: string | null; rejection_reason?: string | null;
          reopened_from_completion_id?: string | null; subject?: SubjectTag | null;
          created_at?: string;
        };
        Relationships: [];
      };
      incidents: {
        Row: {
          id: string; outlet_id: string; source_session_id: string | null; subject: SubjectTag | null;
          entity_type: string | null; entity_id: string | null; is_safety: boolean; severity: IncidentSeverity | null;
          description: string; status: IncidentStatus; resolved_by: string | null; resolved_at: string | null;
          resolution_voice_session_id: string | null; resolution_note: string | null; handover_reason: string | null;
          handover_session_id: string | null; response_type: IncidentResponseType; requires_immediate_call: boolean;
          created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; source_session_id?: string | null; subject?: SubjectTag | null;
          entity_type?: string | null; entity_id?: string | null; is_safety?: boolean; severity?: IncidentSeverity | null;
          description: string; status?: IncidentStatus; resolved_by?: string | null; resolved_at?: string | null;
          resolution_voice_session_id?: string | null; resolution_note?: string | null; handover_reason?: string | null;
          handover_session_id?: string | null; response_type: IncidentResponseType; requires_immediate_call?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; source_session_id?: string | null; subject?: SubjectTag | null;
          entity_type?: string | null; entity_id?: string | null; is_safety?: boolean; severity?: IncidentSeverity | null;
          description?: string; status?: IncidentStatus; resolved_by?: string | null; resolved_at?: string | null;
          resolution_voice_session_id?: string | null; resolution_note?: string | null; handover_reason?: string | null;
          handover_session_id?: string | null; response_type?: IncidentResponseType; requires_immediate_call?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      judgment_calls: {
        Row: {
          id: string; outlet_id: string; session_id: string; user_id: string | null; subject: SubjectTag | null;
          situation: string; action_taken: string | null; interview_session_id: string | null; interview_qa: Json | null;
          promoted_to_pattern_id: string | null; flagged_to_manager: boolean; manager_notified_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; session_id: string; user_id?: string | null; subject?: SubjectTag | null;
          situation: string; action_taken?: string | null; interview_session_id?: string | null; interview_qa?: Json | null;
          promoted_to_pattern_id?: string | null; flagged_to_manager?: boolean; manager_notified_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; session_id?: string; user_id?: string | null; subject?: SubjectTag | null;
          situation?: string; action_taken?: string | null; interview_session_id?: string | null; interview_qa?: Json | null;
          promoted_to_pattern_id?: string | null; flagged_to_manager?: boolean; manager_notified_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      knowledge_gaps: {
        Row: {
          id: string; source_session_id: string | null; outlet_id: string; question_text: string;
          entity_type: string | null; entity_id: string | null; occurrence_count: number;
          escalation_level: KnowledgeGapEscalationLevel; escalated_to: string | null; status: KnowledgeGapStatus;
          resolution_text: string | null; promoted_to_type: string | null; promoted_to_id: string | null;
          resolved_by: string | null; resolved_at: string | null; created_at: string;
        };
        Insert: {
          id?: string; source_session_id?: string | null; outlet_id: string; question_text: string;
          entity_type?: string | null; entity_id?: string | null; occurrence_count?: number;
          escalation_level?: KnowledgeGapEscalationLevel; escalated_to?: string | null; status?: KnowledgeGapStatus;
          resolution_text?: string | null; promoted_to_type?: string | null; promoted_to_id?: string | null;
          resolved_by?: string | null; resolved_at?: string | null; created_at?: string;
        };
        Update: {
          id?: string; source_session_id?: string | null; outlet_id?: string; question_text?: string;
          entity_type?: string | null; entity_id?: string | null; occurrence_count?: number;
          escalation_level?: KnowledgeGapEscalationLevel; escalated_to?: string | null; status?: KnowledgeGapStatus;
          resolution_text?: string | null; promoted_to_type?: string | null; promoted_to_id?: string | null;
          resolved_by?: string | null; resolved_at?: string | null; created_at?: string;
        };
        Relationships: [];
      };
      wastage_entries: {
        Row: {
          id: string; source_session_id: string | null; outlet_id: string; item: string; quantity: number | null;
          reason: string | null; photo_url: string | null; status: WastageStatus; approved_by: string | null;
          synced_to_pos_at: string | null; reversed: boolean; reversal_reason: string | null;
          reversed_by: string | null; reversed_at: string | null; reversal_pos_entry_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string; source_session_id?: string | null; outlet_id: string; item: string; quantity?: number | null;
          reason?: string | null; photo_url?: string | null; status?: WastageStatus; approved_by?: string | null;
          synced_to_pos_at?: string | null; reversed?: boolean; reversal_reason?: string | null;
          reversed_by?: string | null; reversed_at?: string | null; reversal_pos_entry_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string; source_session_id?: string | null; outlet_id?: string; item?: string; quantity?: number | null;
          reason?: string | null; photo_url?: string | null; status?: WastageStatus; approved_by?: string | null;
          synced_to_pos_at?: string | null; reversed?: boolean; reversal_reason?: string | null;
          reversed_by?: string | null; reversed_at?: string | null; reversal_pos_entry_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      pos_permissions: {
        Row: { id: string; outlet_id: string; action_type: string; mode: PosPermissionMode; created_at: string };
        Insert: { id?: string; outlet_id: string; action_type: string; mode: PosPermissionMode; created_at?: string };
        Update: { id?: string; outlet_id?: string; action_type?: string; mode?: PosPermissionMode; created_at?: string };
        Relationships: [];
      };
      pos_synced_tasks: {
        Row: {
          id: string; outlet_id: string; pos_task_id: string; description: string; assigned_to: string | null;
          synced_at: string; status: string; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; pos_task_id: string; description: string; assigned_to?: string | null;
          synced_at?: string; status?: string; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; pos_task_id?: string; description?: string; assigned_to?: string | null;
          synced_at?: string; status?: string; created_at?: string;
        };
        Relationships: [];
      };
      scheduled_shifts: {
        Row: {
          id: string; outlet_id: string; user_id: string | null; org_position_id: string | null; shift_date: string;
          start_time: string; end_time: string; status: string; pos_shift_id: string | null;
          synced_at: string | null; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; user_id?: string | null; org_position_id?: string | null; shift_date: string;
          start_time: string; end_time: string; status?: string; pos_shift_id?: string | null;
          synced_at?: string | null; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; user_id?: string | null; org_position_id?: string | null; shift_date?: string;
          start_time?: string; end_time?: string; status?: string; pos_shift_id?: string | null;
          synced_at?: string | null; created_at?: string;
        };
        Relationships: [];
      };
      shift_handovers: {
        Row: {
          id: string; outlet_id: string; scheduled_shift_id: string | null; source_session_ids: string[];
          unresolved_incident_ids: string[]; compiled_summary: string | null; gaps_flagged: boolean;
          signed_off_by: string | null; signed_off_at: string | null; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; scheduled_shift_id?: string | null; source_session_ids?: string[];
          unresolved_incident_ids?: string[]; compiled_summary?: string | null; gaps_flagged?: boolean;
          signed_off_by?: string | null; signed_off_at?: string | null; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; scheduled_shift_id?: string | null; source_session_ids?: string[];
          unresolved_incident_ids?: string[]; compiled_summary?: string | null; gaps_flagged?: boolean;
          signed_off_by?: string | null; signed_off_at?: string | null; created_at?: string;
        };
        Relationships: [];
      };
      shift_openings: {
        Row: {
          id: string; outlet_id: string; scheduled_shift_id: string | null; user_id: string | null;
          incoming_handover_id: string | null; carried_items_reviewed: boolean; discrepancy_flagged: boolean;
          discrepancy_note: string | null; started_at: string; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; scheduled_shift_id?: string | null; user_id?: string | null;
          incoming_handover_id?: string | null; carried_items_reviewed?: boolean; discrepancy_flagged?: boolean;
          discrepancy_note?: string | null; started_at?: string; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; scheduled_shift_id?: string | null; user_id?: string | null;
          incoming_handover_id?: string | null; carried_items_reviewed?: boolean; discrepancy_flagged?: boolean;
          discrepancy_note?: string | null; started_at?: string; created_at?: string;
        };
        Relationships: [];
      };
      checklist_completions: {
        Row: {
          id: string; outlet_id: string; checklist_item_id: string; shift_opening_id: string | null;
          shift_handover_id: string | null; completed_by: string | null; proof_media_url: string | null;
          proof_value: string | null; voice_session_id: string | null; verified: boolean; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; checklist_item_id: string; shift_opening_id?: string | null;
          shift_handover_id?: string | null; completed_by?: string | null; proof_media_url?: string | null;
          proof_value?: string | null; voice_session_id?: string | null; verified?: boolean; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; checklist_item_id?: string; shift_opening_id?: string | null;
          shift_handover_id?: string | null; completed_by?: string | null; proof_media_url?: string | null;
          proof_value?: string | null; voice_session_id?: string | null; verified?: boolean; created_at?: string;
        };
        Relationships: [];
      };
      compliance_reminders: {
        Row: {
          id: string; outlet_id: string; topic: string; due_date: string; process_duration_days: number;
          reminder_date: string; proof_document_url: string | null; status: ComplianceStatus;
          cleared_by: string | null; created_at: string;
        };
        // reminder_date is a generated column (due_date - process_duration_days) — never settable.
        Insert: {
          id?: string; outlet_id: string; topic: string; due_date: string; process_duration_days?: number;
          proof_document_url?: string | null; status?: ComplianceStatus; cleared_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; topic?: string; due_date?: string; process_duration_days?: number;
          proof_document_url?: string | null; status?: ComplianceStatus; cleared_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      entity_links: {
        Row: { id: string; source_type: string; source_id: string; entity_type: string; entity_id: string; created_at: string };
        Insert: { id?: string; source_type: string; source_id: string; entity_type: string; entity_id: string; created_at?: string };
        Update: { id?: string; source_type?: string; source_id?: string; entity_type?: string; entity_id?: string; created_at?: string };
        Relationships: [];
      };
      report_definitions: {
        Row: {
          id: string; outlet_id: string; name: string; entity_type: string; metric: string; filter: Json | null;
          group_by: string | null; time_window: string | null; recipient_role: AccessTier | null; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; name: string; entity_type: string; metric: string; filter?: Json | null;
          group_by?: string | null; time_window?: string | null; recipient_role?: AccessTier | null; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; name?: string; entity_type?: string; metric?: string; filter?: Json | null;
          group_by?: string | null; time_window?: string | null; recipient_role?: AccessTier | null; created_at?: string;
        };
        Relationships: [];
      };
      report_instances: {
        Row: {
          id: string; report_definition_id: string; period_start: string | null; period_end: string | null;
          data_body: Json; insight_text: string | null; actionable_text: string | null; source_ids: string[];
          created_at: string;
        };
        Insert: {
          id?: string; report_definition_id: string; period_start?: string | null; period_end?: string | null;
          data_body: Json; insight_text?: string | null; actionable_text?: string | null; source_ids?: string[];
          created_at?: string;
        };
        Update: {
          id?: string; report_definition_id?: string; period_start?: string | null; period_end?: string | null;
          data_body?: Json; insight_text?: string | null; actionable_text?: string | null; source_ids?: string[];
          created_at?: string;
        };
        Relationships: [];
      };
      broadcasts: {
        Row: {
          id: string; outlet_id: string; sender_id: string | null; message: string;
          target_access_tier: AccessTier | null; important: boolean; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; sender_id?: string | null; message: string;
          target_access_tier?: AccessTier | null; important?: boolean; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; sender_id?: string | null; message?: string;
          target_access_tier?: AccessTier | null; important?: boolean; created_at?: string;
        };
        Relationships: [];
      };
      broadcast_acknowledgements: {
        Row: { id: string; broadcast_id: string; user_id: string; acknowledged_at: string };
        Insert: { id?: string; broadcast_id: string; user_id: string; acknowledged_at?: string };
        Update: { id?: string; broadcast_id?: string; user_id?: string; acknowledged_at?: string };
        Relationships: [];
      };
      shift_swap_requests: {
        Row: {
          id: string; outlet_id: string; requested_by: string; scheduled_shift_id: string | null;
          shift_date: string; start_time: string; end_time: string; reason: string;
          volunteer_id: string | null; status: ShiftSwapStatus; approved_by: string | null;
          approved_at: string | null; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; requested_by: string; scheduled_shift_id?: string | null;
          shift_date: string; start_time: string; end_time: string; reason: string;
          volunteer_id?: string | null; status?: ShiftSwapStatus; approved_by?: string | null;
          approved_at?: string | null; created_at?: string;
        };
        Update: {
          id?: string; outlet_id?: string; requested_by?: string; scheduled_shift_id?: string | null;
          shift_date?: string; start_time?: string; end_time?: string; reason?: string;
          volunteer_id?: string | null; status?: ShiftSwapStatus; approved_by?: string | null;
          approved_at?: string | null; created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_user_outlet_id: { Args: Record<string, never>; Returns: string | null };
      current_user_brand_id: { Args: Record<string, never>; Returns: string | null };
      current_user_access_tier: { Args: Record<string, never>; Returns: AccessTier | null };
      is_gm_owner: { Args: Record<string, never>; Returns: boolean };
      user_can_access_outlet: { Args: { target_outlet_id: string | null }; Returns: boolean };
    };
    Enums: {
      access_tier: AccessTier;
      approval_status: ApprovalStatus;
      session_mode: SessionMode;
      session_initiator: SessionInitiator;
      session_status: SessionStatus;
      message_sender: MessageSender;
      classification_type: ClassificationType;
      subject_tag: SubjectTag;
      task_status: TaskStatus;
      completion_mode: CompletionMode;
      incident_status: IncidentStatus;
      incident_response_type: IncidentResponseType;
      incident_severity: IncidentSeverity;
      wastage_status: WastageStatus;
      pos_permission_mode: PosPermissionMode;
      knowledge_gap_escalation_level: KnowledgeGapEscalationLevel;
      knowledge_gap_status: KnowledgeGapStatus;
      checklist_category: ChecklistCategory;
      proof_type: ProofType;
      task_proof_type: TaskProofType;
      shift_swap_status: ShiftSwapStatus;
      task_completion_status: TaskCompletionStatus;
      compliance_status: ComplianceStatus;
    };
  };
}
