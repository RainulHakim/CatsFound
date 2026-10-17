/**
 * Database types in the shape supabase-js expects.
 * Hand-maintained to match supabase/migrations. When a database is reachable,
 * regenerate with: npx supabase gen types typescript --db-url "$SUPABASE_DB_URL"
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = "student" | "staff" | "admin";
export type ItemStatus = "open" | "claimed" | "collected" | "archived";
export type LostReportStatus = "active" | "matched" | "resolved" | "expired";
export type ClaimStatus = "pending" | "approved" | "denied" | "collected";

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type CampusRow = {
  id: string;
  name: string;
  slug: string;
  email_domain: string;
  created_at: string;
};

export type CategoryRow = {
  id: string;
  campus_id: string;
  name: string;
  slug: string;
  group_slug: string;
  is_sensitive: boolean;
  icon: string;
  sort_order: number;
};

export type BuildingRow = {
  id: string;
  campus_id: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  is_active: boolean;
};

export type DropOffPointRow = {
  id: string;
  campus_id: string;
  building_id: string;
  name: string;
  slug: string;
  instructions: string;
  accepts_sensitive: boolean;
  is_active: boolean;
  sort_order: number;
};

export type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  notification_prefs: Json;
  created_at: string;
};

export type ItemRow = {
  id: string;
  status: ItemStatus;
  category_id: string;
  color_tags: string[];
  building_id: string;
  drop_off_point_id: string | null;
  found_at: string;
  description: string;
  is_sensitive: boolean;
  search_tsv: unknown;
  created_at: string;
  updated_at: string;
  collected_at: string | null;
  archived_at: string | null;
};

export type ItemPrivateRow = {
  item_id: string;
  posted_by: string | null;
  verification_secret_enc: string | null;
  posted_by_contact_enc: string | null;
  created_at: string;
};

export type ItemPhotoRow = {
  id: string;
  item_id: string;
  storage_path: string;
  variants: number[];
  width: number;
  height: number;
  blurhash: string;
  sort_order: number;
  created_at: string;
};

export type LostReportRow = {
  id: string;
  user_id: string;
  status: LostReportStatus;
  category_id: string;
  color_tags: string[];
  building_ids: string[];
  lost_after: string;
  lost_before: string;
  description: string;
  distinguishing_marks: string;
  reference_photo_path: string | null;
  created_at: string;
  expires_at: string;
  renewal_notified_at: string | null;
};

export type MatchRow = {
  id: string;
  lost_report_id: string;
  item_id: string;
  score: number;
  tier: 0 | 1 | 2;
  notified_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};

export type ClaimRow = {
  id: string;
  item_id: string;
  claimant_id: string;
  status: ClaimStatus;
  verification_answer_enc: string | null;
  verification_attempts: number;
  verification_passed: boolean | null;
  honor_pledge_accepted: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
};

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Json;
  ip_hash: string | null;
  created_at: string;
};

export type MetricsEventRow = {
  id: string;
  name: "time_to_post";
  value: number;
  item_id: string | null;
  metadata: Json;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      campuses: Table<CampusRow>;
      categories: Table<CategoryRow>;
      buildings: Table<BuildingRow>;
      drop_off_points: Table<DropOffPointRow>;
      users: Table<UserRow>;
      items: Table<ItemRow>;
      item_private: Table<ItemPrivateRow>;
      item_photos: Table<ItemPhotoRow>;
      lost_reports: Table<LostReportRow>;
      matches: Table<MatchRow>;
      claims: Table<ClaimRow>;
      audit_log: Table<AuditLogRow>;
      metrics_events: Table<MetricsEventRow>;
      rate_limits: Table<{ key: string; window_start: string; hits: number }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      app_role: { Args: Record<string, never>; Returns: UserRole | null };
      is_staff: { Args: Record<string, never>; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      rate_limit_hit: {
        Args: { p_key: string; p_window_seconds: number; p_max: number };
        Returns: boolean;
      };
      rate_limits_prune: { Args: { p_older_than?: string }; Returns: number };
    };
    Enums: {
      user_role: UserRole;
      item_status: ItemStatus;
      lost_report_status: LostReportStatus;
      claim_status: ClaimStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
