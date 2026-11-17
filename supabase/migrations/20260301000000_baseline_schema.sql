-- Baseline: the production public schema (project qesjmvgihxhfbieivuvd) as of 11-17-2026.
-- Source: `supabase db dump --linked --schema public`, schema only, no rows.
-- Replaces the earlier migration files, which assumed tables that no migration created
-- (phases 1-8 were built before migrations were used), so an empty project could not be built.
-- Production already has all of this. Its migration ledger is repaired separately (prod-queue),
-- so this file never runs there.

-- qa_readonly is a login role on production (QA read access). A fresh project gets it as
-- NOLOGIN with no password, so the grants below apply and no credential is created.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qa_readonly') THEN
    CREATE ROLE qa_readonly NOLOGIN;
  END IF;
END
$$;




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."application_status" AS ENUM (
    'draft',
    'submitted',
    'under_review',
    'approved',
    'rejected',
    'archived'
);


ALTER TYPE "public"."application_status" OWNER TO "postgres";


CREATE TYPE "public"."application_type" AS ENUM (
    'leave_request',
    'expense_report',
    'equipment_request',
    'access_request',
    'onboarding',
    'general',
    'custom'
);


ALTER TYPE "public"."application_type" OWNER TO "postgres";


CREATE TYPE "public"."employee_role" AS ENUM (
    'admin',
    'manager',
    'staff'
);


ALTER TYPE "public"."employee_role" OWNER TO "postgres";


CREATE TYPE "public"."employee_status" AS ENUM (
    'active',
    'inactive',
    'suspended'
);


ALTER TYPE "public"."employee_status" OWNER TO "postgres";


CREATE TYPE "public"."file_access_level" AS ENUM (
    'public',
    'department',
    'restricted',
    'confidential'
);


ALTER TYPE "public"."file_access_level" OWNER TO "postgres";


CREATE TYPE "public"."file_status" AS ENUM (
    'active',
    'archived',
    'deleted'
);


ALTER TYPE "public"."file_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_receipt_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  seq_val BIGINT;
  yr TEXT;
BEGIN
  seq_val := nextval('public.receipt_number_seq');
  yr := to_char(now(), 'YYYY');
  RETURN 'Z-' || yr || '-' || lpad(seq_val::text, 5, '0');
END;
$$;


ALTER FUNCTION "public"."generate_receipt_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_donor_id_for_auth_user"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT id FROM donors WHERE auth_user_id = auth.uid() LIMIT 1;
$$;


ALTER FUNCTION "public"."get_donor_id_for_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE auth_user_id = auth.uid() AND is_active = true
  );
$$;


ALTER FUNCTION "public"."is_admin_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_donation_tax_year"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.tax_year := EXTRACT(YEAR FROM NEW.donated_at)::integer;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_donation_tax_year"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_inkind_tax_year"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.tax_year := EXTRACT(YEAR FROM NEW.donated_at)::integer;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_inkind_tax_year"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_campaign_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.campaign_id IS NOT NULL AND NEW.status = 'succeeded' THEN
    UPDATE public.campaigns SET
      raised_cents = (
        SELECT COALESCE(SUM(amount_cents), 0) 
        FROM public.donations 
        WHERE campaign_id = NEW.campaign_id AND status = 'succeeded'
      )
    WHERE id = NEW.campaign_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_campaign_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_donor_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'succeeded' THEN
    UPDATE public.donors SET
      total_donated_cents = total_donated_cents + NEW.amount_cents,
      donation_count = donation_count + 1,
      first_donated_at = COALESCE(first_donated_at, NEW.donated_at),
      last_donated_at = GREATEST(COALESCE(last_donated_at, NEW.donated_at), NEW.donated_at),
      updated_at = now()
    WHERE id = NEW.donor_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status != 'refunded' AND NEW.status = 'refunded' THEN
    UPDATE public.donors SET
      total_donated_cents = total_donated_cents - OLD.amount_cents,
      donation_count = GREATEST(donation_count - 1, 0),
      updated_at = now()
    WHERE id = NEW.donor_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_donor_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_donors_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_donors_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."acknowledgment_letters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "donor_id" "uuid" NOT NULL,
    "donation_id" "uuid",
    "template_tier" "text" NOT NULL,
    "letter_pdf_path" "text",
    "sent_via" "text",
    "sent_at" timestamp with time zone,
    "signed_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "acknowledgment_letters_sent_via_check" CHECK (("sent_via" = ANY (ARRAY['email'::"text", 'mail'::"text", 'both'::"text"]))),
    CONSTRAINT "acknowledgment_letters_template_tier_check" CHECK (("template_tier" = ANY (ARRAY['standard'::"text", 'supporter'::"text", 'major_donor'::"text", 'leadership'::"text", 'first_time'::"text", 'anniversary'::"text"])))
);


ALTER TABLE "public"."acknowledgment_letters" OWNER TO "postgres";


COMMENT ON TABLE "public"."acknowledgment_letters" IS 'Tiered donor thank-you letter tracking';



CREATE TABLE IF NOT EXISTS "public"."admin_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_user_id" "uuid",
    "action" "text" NOT NULL,
    "resource_type" "text",
    "resource_id" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text",
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "last_login_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "admin_users_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'finance'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_type" "public"."application_type" DEFAULT 'general'::"public"."application_type" NOT NULL,
    "title" "text" NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "assigned_to" "uuid",
    "status" "public"."application_status" DEFAULT 'draft'::"public"."application_status" NOT NULL,
    "form_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "attachments" "text"[],
    "priority" integer DEFAULT 0,
    "notes" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "resource_type" "text",
    "resource_id" "uuid",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "goal_cents" bigint,
    "raised_cents" bigint DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "start_date" "date",
    "end_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


COMMENT ON TABLE "public"."campaigns" IS 'Fundraising campaigns and fund designations';



CREATE TABLE IF NOT EXISTS "public"."company_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_size" bigint,
    "mime_type" "text",
    "access_level" "public"."file_access_level" DEFAULT 'department'::"public"."file_access_level" NOT NULL,
    "department" "text",
    "description" "text",
    "tags" "text"[],
    "uploaded_by" "uuid" NOT NULL,
    "status" "public"."file_status" DEFAULT 'active'::"public"."file_status" NOT NULL,
    "checksum" "text",
    "encryption_key_id" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."compliance_alert_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deadline_id" "uuid",
    "alert_days" integer NOT NULL,
    "sent_to" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "sendgrid_status" "text"
);


ALTER TABLE "public"."compliance_alert_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."compliance_deadlines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "filing_type" "text" NOT NULL,
    "filing_name" "text" NOT NULL,
    "description" "text",
    "deadline_date" "date" NOT NULL,
    "alert_start_date" "date",
    "status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "assigned_to" "text",
    "notes" "text",
    "confirmation_number" "text",
    "filed_at" timestamp with time zone,
    "e_file_provider" "text",
    "portal_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "compliance_deadlines_status_check" CHECK (("status" = ANY (ARRAY['upcoming'::"text", 'in_progress'::"text", 'under_review'::"text", 'filed'::"text", 'accepted'::"text", 'rejected'::"text", 'overdue'::"text"])))
);


ALTER TABLE "public"."compliance_deadlines" OWNER TO "postgres";


COMMENT ON TABLE "public"."compliance_deadlines" IS 'Active filing obligations with deadline tracking and alerts';



CREATE TABLE IF NOT EXISTS "public"."compliance_filings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "filing_type" "text" NOT NULL,
    "tax_year" integer,
    "form_version" "text",
    "submitted_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "confirmation_number" "text",
    "e_file_provider" "text",
    "data_export_path" "text",
    "filed_by" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."compliance_filings" OWNER TO "postgres";


COMMENT ON TABLE "public"."compliance_filings" IS 'Historical record of completed federal and state filings';



CREATE TABLE IF NOT EXISTS "public"."dashboard_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapshot_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dashboard_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."donation_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "donation_id" "uuid",
    "donor_id" "uuid" NOT NULL,
    "receipt_type" "text" NOT NULL,
    "tax_year" integer NOT NULL,
    "receipt_number" "text" NOT NULL,
    "pdf_storage_path" "text",
    "voided_at" timestamp with time zone,
    "voided_reason" "text",
    "sent_at" timestamp with time zone,
    "sent_via" "text" DEFAULT 'email'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "donation_receipts_receipt_type_check" CHECK (("receipt_type" = ANY (ARRAY['instant'::"text", 'year_end'::"text", 'void'::"text", 'amended'::"text"]))),
    CONSTRAINT "donation_receipts_sent_via_check" CHECK (("sent_via" = ANY (ARRAY['email'::"text", 'mail'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."donation_receipts" OWNER TO "postgres";


COMMENT ON TABLE "public"."donation_receipts" IS 'IRS-compliant receipt records with PDF storage paths';



CREATE TABLE IF NOT EXISTS "public"."donations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "donor_id" "uuid" NOT NULL,
    "stripe_payment_intent_id" "text",
    "stripe_charge_id" "text",
    "stripe_session_id" "text",
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text",
    "donation_type" "text" DEFAULT 'one_time'::"text" NOT NULL,
    "designation" "text" DEFAULT 'unrestricted'::"text",
    "campaign_id" "uuid",
    "is_anonymous" boolean DEFAULT false,
    "goods_services_provided" boolean DEFAULT false,
    "goods_services_description" "text",
    "goods_services_value_cents" integer DEFAULT 0,
    "tax_deductible_amount_cents" integer GENERATED ALWAYS AS (
CASE
    WHEN ("goods_services_provided" = true) THEN GREATEST(("amount_cents" - COALESCE("goods_services_value_cents", 0)), 0)
    ELSE "amount_cents"
END) STORED,
    "payment_method" "text",
    "card_last_four" "text",
    "card_brand" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "receipt_number" "text",
    "receipt_issued_at" timestamp with time zone,
    "receipt_pdf_path" "text",
    "thank_you_sent_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "refund_amount_cents" integer DEFAULT 0,
    "refund_reason" "text",
    "dedication_type" "text",
    "dedication_name" "text",
    "notes" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "referrer_url" "text",
    "tax_year" integer,
    "donated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "event_id" "uuid",
    CONSTRAINT "donations_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "donations_dedication_type_check" CHECK (("dedication_type" = ANY (ARRAY['in_honor_of'::"text", 'in_memory_of'::"text"]))),
    CONSTRAINT "donations_designation_check" CHECK (("designation" = ANY (ARRAY['unrestricted'::"text", 'youth_programs'::"text", 'education'::"text", 'community_development'::"text", 'scholarship'::"text", 'other'::"text"]))),
    CONSTRAINT "donations_donation_type_check" CHECK (("donation_type" = ANY (ARRAY['one_time'::"text", 'recurring'::"text"]))),
    CONSTRAINT "donations_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['card'::"text", 'ach'::"text", 'check'::"text", 'wire'::"text", 'cash'::"text", 'other'::"text"]))),
    CONSTRAINT "donations_status_check" CHECK (("status" = ANY (ARRAY['succeeded'::"text", 'pending'::"text", 'failed'::"text", 'refunded'::"text", 'partially_refunded'::"text"])))
);


ALTER TABLE "public"."donations" OWNER TO "postgres";


COMMENT ON TABLE "public"."donations" IS 'Every donation transaction with IRS-required detail and Stripe references';



CREATE TABLE IF NOT EXISTS "public"."donor_communications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "donor_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "category" "text" NOT NULL,
    "opted_in" boolean DEFAULT true,
    "opted_in_at" timestamp with time zone DEFAULT "now"(),
    "opted_out_at" timestamp with time zone,
    "unsubscribe_token" "uuid" DEFAULT "gen_random_uuid"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "donor_communications_category_check" CHECK (("category" = ANY (ARRAY['receipts'::"text", 'appeals'::"text", 'newsletter'::"text", 'events'::"text", 'annual_report'::"text", 'volunteer'::"text"]))),
    CONSTRAINT "donor_communications_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'sms'::"text", 'mail'::"text"]))),
    CONSTRAINT "valid_category" CHECK (("category" = ANY (ARRAY['receipts'::"text", 'statements'::"text", 'marketing'::"text", 'compliance'::"text", 'events'::"text", 'newsletters'::"text", 'fundraising'::"text"]))),
    CONSTRAINT "valid_channel" CHECK (("channel" = ANY (ARRAY['email'::"text", 'mail'::"text", 'phone'::"text", 'sms'::"text"])))
);


ALTER TABLE "public"."donor_communications" OWNER TO "postgres";


COMMENT ON TABLE "public"."donor_communications" IS 'CAN-SPAM/TCPA compliant communication preferences';



CREATE TABLE IF NOT EXISTS "public"."donor_verification_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "donor_id" "uuid",
    "tax_year" integer NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "verified_at" timestamp with time zone
);


ALTER TABLE "public"."donor_verification_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."donors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stripe_customer_id" "text",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "address_line1" "text",
    "address_line2" "text",
    "city" "text",
    "state" "text",
    "zip" "text",
    "country" "text" DEFAULT 'US'::"text",
    "employer" "text",
    "is_anonymous" boolean DEFAULT false,
    "total_donated_cents" bigint DEFAULT 0,
    "donation_count" integer DEFAULT 0,
    "first_donated_at" timestamp with time zone,
    "last_donated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "auth_user_id" "uuid"
);


ALTER TABLE "public"."donors" OWNER TO "postgres";


COMMENT ON TABLE "public"."donors" IS 'Master donor records with IRS-required contact information';



CREATE TABLE IF NOT EXISTS "public"."email_send_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid",
    "sent_by" "uuid" NOT NULL,
    "recipient_email" "text" NOT NULL,
    "recipient_name" "text",
    "subject" "text" NOT NULL,
    "variables_used" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_send_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body_html" "text" NOT NULL,
    "body_text" "text",
    "variables" "text"[],
    "category" "text",
    "created_by" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "department" "text",
    "role" "public"."employee_role" DEFAULT 'staff'::"public"."employee_role" NOT NULL,
    "status" "public"."employee_status" DEFAULT 'active'::"public"."employee_status" NOT NULL,
    "phone" "text",
    "job_title" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employee_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_attendees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "donor_id" "uuid",
    "donation_id" "uuid",
    "name" "text" NOT NULL,
    "email" "text",
    "ticket_type" "text" DEFAULT 'general'::"text",
    "ticket_price_cents" integer DEFAULT 0 NOT NULL,
    "checked_in" boolean DEFAULT false,
    "checked_in_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."event_attendees" OWNER TO "postgres";


COMMENT ON TABLE "public"."event_attendees" IS 'Event ticket purchasers with check-in tracking';



CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "event_date" timestamp with time zone NOT NULL,
    "venue" "text",
    "ticket_price_cents" integer DEFAULT 0,
    "fair_market_value_cents" integer DEFAULT 0,
    "tax_deductible_cents" integer GENERATED ALWAYS AS (GREATEST(("ticket_price_cents" - COALESCE("fair_market_value_cents", 0)), 0)) STORED,
    "capacity" integer,
    "tickets_sold" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "campaign_id" "uuid",
    "total_revenue_cents" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."events" OWNER TO "postgres";


COMMENT ON TABLE "public"."events" IS 'Fundraising events with quid pro quo FMV tracking';



CREATE TABLE IF NOT EXISTS "public"."grant_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "grant_id" "uuid" NOT NULL,
    "report_name" "text" NOT NULL,
    "due_date" "date" NOT NULL,
    "submitted_at" timestamp with time zone,
    "submitted_by" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "grant_reports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'submitted'::"text", 'approved'::"text", 'revision_requested'::"text"])))
);


ALTER TABLE "public"."grant_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "funder_name" "text" NOT NULL,
    "funder_contact_email" "text",
    "award_amount_cents" bigint NOT NULL,
    "spent_to_date_cents" bigint DEFAULT 0,
    "restriction_type" "text" DEFAULT 'unrestricted'::"text" NOT NULL,
    "purpose" "text",
    "program" "text",
    "grant_period_start" "date",
    "grant_period_end" "date",
    "reporting_frequency" "text",
    "next_report_due" "date",
    "deliverables" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "grants_reporting_frequency_check" CHECK (("reporting_frequency" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'semi_annual'::"text", 'annual'::"text", 'final_only'::"text"]))),
    CONSTRAINT "grants_restriction_type_check" CHECK (("restriction_type" = ANY (ARRAY['unrestricted'::"text", 'temporarily_restricted'::"text", 'permanently_restricted'::"text"]))),
    CONSTRAINT "grants_status_check" CHECK (("status" = ANY (ARRAY['prospective'::"text", 'applied'::"text", 'awarded'::"text", 'active'::"text", 'reporting'::"text", 'closed'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."grants" OWNER TO "postgres";


COMMENT ON TABLE "public"."grants" IS 'Foundation and government grant tracking with restriction management';



CREATE TABLE IF NOT EXISTS "public"."in_kind_donations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "donor_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" NOT NULL,
    "estimated_value_cents" bigint,
    "valuation_method" "text",
    "appraiser_name" "text",
    "form_8283_required" boolean DEFAULT false,
    "form_8283_signed" boolean DEFAULT false,
    "form_1098c_required" boolean DEFAULT false,
    "form_1098c_issued_at" timestamp with time zone,
    "receipt_number" "text",
    "receipt_issued_at" timestamp with time zone,
    "receipt_pdf_path" "text",
    "photo_paths" "text"[],
    "donated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tax_year" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "vehicle_vin" "text",
    "vehicle_year" integer,
    "vehicle_make" "text",
    "vehicle_model" "text",
    CONSTRAINT "in_kind_donations_category_check" CHECK (("category" = ANY (ARRAY['goods'::"text", 'property'::"text", 'vehicle'::"text", 'services'::"text", 'securities'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."in_kind_donations" OWNER TO "postgres";


COMMENT ON TABLE "public"."in_kind_donations" IS 'Non-cash contributions with IRS form tracking';



CREATE TABLE IF NOT EXISTS "public"."matching_gift_companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" "text" NOT NULL,
    "match_ratio" numeric(5,2) DEFAULT 1.00 NOT NULL,
    "max_match_cents" integer,
    "min_donation_cents" integer DEFAULT 2500,
    "annual_max_cents" integer,
    "submission_deadline_months" integer DEFAULT 12,
    "program_url" "text",
    "notes" "text",
    "is_verified" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."matching_gift_companies" OWNER TO "postgres";


COMMENT ON TABLE "public"."matching_gift_companies" IS 'Known employer matching gift programs with match ratios and limits';



CREATE TABLE IF NOT EXISTS "public"."matching_gifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "donation_id" "uuid" NOT NULL,
    "donor_id" "uuid" NOT NULL,
    "company_id" "uuid",
    "company_name" "text" NOT NULL,
    "match_ratio" numeric(5,2) DEFAULT 1.00 NOT NULL,
    "original_amount_cents" integer NOT NULL,
    "match_amount_cents" integer NOT NULL,
    "status" "text" DEFAULT 'identified'::"text" NOT NULL,
    "submitted_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "received_at" timestamp with time zone,
    "denied_at" timestamp with time zone,
    "denial_reason" "text",
    "match_receipt_number" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "matching_gifts_status_check" CHECK (("status" = ANY (ARRAY['identified'::"text", 'submitted'::"text", 'approved'::"text", 'received'::"text", 'denied'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."matching_gifts" OWNER TO "postgres";


COMMENT ON TABLE "public"."matching_gifts" IS 'Tracks employer matching gift status for individual donations';



CREATE TABLE IF NOT EXISTS "public"."pledges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "donor_id" "uuid" NOT NULL,
    "total_pledge_cents" bigint NOT NULL,
    "paid_to_date_cents" bigint DEFAULT 0,
    "installment_count" integer,
    "installment_amount_cents" integer,
    "frequency" "text",
    "designation" "text" DEFAULT 'unrestricted'::"text",
    "start_date" "date" NOT NULL,
    "next_payment_date" "date",
    "end_date" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "installments_paid" integer DEFAULT 0,
    CONSTRAINT "pledges_frequency_check" CHECK (("frequency" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'annual'::"text", 'custom'::"text"]))),
    CONSTRAINT "pledges_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'fulfilled'::"text", 'cancelled'::"text", 'delinquent'::"text", 'paused'::"text"]))),
    CONSTRAINT "pledges_total_pledge_cents_check" CHECK (("total_pledge_cents" > 0))
);


ALTER TABLE "public"."pledges" OWNER TO "postgres";


COMMENT ON TABLE "public"."pledges" IS 'Multi-payment donor commitments with installment tracking';



CREATE SEQUENCE IF NOT EXISTS "public"."receipt_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."receipt_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_donations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "donor_id" "uuid" NOT NULL,
    "stripe_subscription_id" "text" NOT NULL,
    "stripe_price_id" "text",
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text",
    "frequency" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "designation" "text" DEFAULT 'unrestricted'::"text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "next_billing_date" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancel_reason" "text",
    "installment_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "recurring_donations_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "recurring_donations_frequency_check" CHECK (("frequency" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'annual'::"text"]))),
    CONSTRAINT "recurring_donations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'cancelled'::"text", 'past_due'::"text", 'incomplete'::"text"])))
);


ALTER TABLE "public"."recurring_donations" OWNER TO "postgres";


COMMENT ON TABLE "public"."recurring_donations" IS 'Stripe subscription tracking for recurring donors';



CREATE TABLE IF NOT EXISTS "public"."state_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_code" "text" NOT NULL,
    "state_name" "text" NOT NULL,
    "registration_number" "text",
    "status" "text" DEFAULT 'not_registered'::"text" NOT NULL,
    "effective_date" "date",
    "expiration_date" "date",
    "renewal_window_days" integer DEFAULT 90,
    "filing_requirements" "text",
    "portal_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "state_registrations_status_check" CHECK (("status" = ANY (ARRAY['not_registered'::"text", 'pending'::"text", 'active'::"text", 'expiring_soon'::"text", 'expired'::"text", 'exempt'::"text"])))
);


ALTER TABLE "public"."state_registrations" OWNER TO "postgres";


COMMENT ON TABLE "public"."state_registrations" IS 'Multi-state charitable solicitation registration tracking';



CREATE TABLE IF NOT EXISTS "public"."system_config" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "text"
);


ALTER TABLE "public"."system_config" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_config" IS 'System-wide configuration including fiscal year and org details';



CREATE OR REPLACE VIEW "public"."v_donation_summary" WITH ("security_invoker"='on') AS
 SELECT "count"(*) AS "total_donations",
    "sum"("amount_cents") AS "total_amount_cents",
    ("avg"("amount_cents"))::integer AS "avg_amount_cents",
    "count"(DISTINCT "donor_id") AS "unique_donors",
    "count"(*) FILTER (WHERE ("donated_at" >= "date_trunc"('month'::"text", (CURRENT_DATE)::timestamp with time zone))) AS "this_month_count",
    "sum"("amount_cents") FILTER (WHERE ("donated_at" >= "date_trunc"('month'::"text", (CURRENT_DATE)::timestamp with time zone))) AS "this_month_cents",
    "count"(*) FILTER (WHERE ("donated_at" >= "date_trunc"('year'::"text", (CURRENT_DATE)::timestamp with time zone))) AS "this_year_count",
    "sum"("amount_cents") FILTER (WHERE ("donated_at" >= "date_trunc"('year'::"text", (CURRENT_DATE)::timestamp with time zone))) AS "this_year_cents",
    "count"(*) FILTER (WHERE ("status" = 'succeeded'::"text")) AS "succeeded_count",
    "count"(*) FILTER (WHERE ("status" = 'refunded'::"text")) AS "refunded_count",
    "count"(*) FILTER (WHERE (("thank_you_sent_at" IS NULL) AND ("status" = 'succeeded'::"text"))) AS "pending_receipts"
   FROM "public"."donations"
  WHERE ("status" = ANY (ARRAY['succeeded'::"text", 'refunded'::"text"]));


ALTER VIEW "public"."v_donation_summary" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_monthly_totals" WITH ("security_invoker"='on') AS
 SELECT ("date_trunc"('month'::"text", "donated_at"))::"date" AS "month",
    "count"(*) AS "donation_count",
    "sum"("amount_cents") AS "total_cents",
    "count"(DISTINCT "donor_id") AS "unique_donors"
   FROM "public"."donations"
  WHERE (("status" = 'succeeded'::"text") AND ("donated_at" >= ("date_trunc"('year'::"text", (CURRENT_DATE)::timestamp with time zone) - '1 year'::interval)))
  GROUP BY ("date_trunc"('month'::"text", "donated_at"))
  ORDER BY (("date_trunc"('month'::"text", "donated_at"))::"date") DESC;


ALTER VIEW "public"."v_monthly_totals" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_recent_donations" WITH ("security_invoker"='on') AS
 SELECT "d"."id",
    "d"."receipt_number",
    "d"."amount_cents",
    "d"."status",
    "d"."donation_type",
    "d"."designation",
    "d"."donated_at",
    "d"."thank_you_sent_at",
    "d"."payment_method",
    "d"."card_brand",
    "d"."card_last_four",
    "dn"."first_name",
    "dn"."last_name",
    "dn"."email"
   FROM ("public"."donations" "d"
     JOIN "public"."donors" "dn" ON (("d"."donor_id" = "dn"."id")))
  ORDER BY "d"."donated_at" DESC;


ALTER VIEW "public"."v_recent_donations" OWNER TO "postgres";


ALTER TABLE ONLY "public"."acknowledgment_letters"
    ADD CONSTRAINT "acknowledgment_letters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_files"
    ADD CONSTRAINT "company_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compliance_alert_log"
    ADD CONSTRAINT "compliance_alert_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compliance_deadlines"
    ADD CONSTRAINT "compliance_deadlines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compliance_filings"
    ADD CONSTRAINT "compliance_filings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dashboard_snapshots"
    ADD CONSTRAINT "dashboard_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donation_receipts"
    ADD CONSTRAINT "donation_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_receipt_number_key" UNIQUE ("receipt_number");



ALTER TABLE ONLY "public"."donor_communications"
    ADD CONSTRAINT "donor_communications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donor_verification_log"
    ADD CONSTRAINT "donor_verification_log_donor_id_tax_year_key" UNIQUE ("donor_id", "tax_year");



ALTER TABLE ONLY "public"."donor_verification_log"
    ADD CONSTRAINT "donor_verification_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donors"
    ADD CONSTRAINT "donors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."donors"
    ADD CONSTRAINT "donors_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."email_send_log"
    ADD CONSTRAINT "email_send_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_profiles"
    ADD CONSTRAINT "employee_profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."employee_profiles"
    ADD CONSTRAINT "employee_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_attendees"
    ADD CONSTRAINT "event_attendees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grant_reports"
    ADD CONSTRAINT "grant_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grants"
    ADD CONSTRAINT "grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."in_kind_donations"
    ADD CONSTRAINT "in_kind_donations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matching_gift_companies"
    ADD CONSTRAINT "matching_gift_companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matching_gifts"
    ADD CONSTRAINT "matching_gifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pledges"
    ADD CONSTRAINT "pledges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_donations"
    ADD CONSTRAINT "recurring_donations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_donations"
    ADD CONSTRAINT "recurring_donations_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."state_registrations"
    ADD CONSTRAINT "state_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_config"
    ADD CONSTRAINT "system_config_pkey" PRIMARY KEY ("key");



CREATE INDEX "idx_ack_letters_donor" ON "public"."acknowledgment_letters" USING "btree" ("donor_id");



CREATE INDEX "idx_admin_audit_log_admin" ON "public"."admin_audit_log" USING "btree" ("admin_user_id");



CREATE INDEX "idx_admin_audit_log_created" ON "public"."admin_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_admin_users_auth_id" ON "public"."admin_users" USING "btree" ("auth_user_id");



CREATE INDEX "idx_admin_users_email" ON "public"."admin_users" USING "btree" ("email");



CREATE INDEX "idx_applications_status" ON "public"."applications" USING "btree" ("status");



CREATE INDEX "idx_applications_submitted_by" ON "public"."applications" USING "btree" ("submitted_by");



CREATE INDEX "idx_applications_type" ON "public"."applications" USING "btree" ("application_type");



CREATE INDEX "idx_audit_log_action" ON "public"."audit_log" USING "btree" ("action");



CREATE INDEX "idx_audit_log_created" ON "public"."audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_log_user" ON "public"."audit_log" USING "btree" ("user_id");



CREATE INDEX "idx_cal_deadline" ON "public"."compliance_alert_log" USING "btree" ("deadline_id", "alert_days");



CREATE INDEX "idx_company_files_access_level" ON "public"."company_files" USING "btree" ("access_level");



CREATE INDEX "idx_company_files_department" ON "public"."company_files" USING "btree" ("department");



CREATE INDEX "idx_company_files_uploaded_by" ON "public"."company_files" USING "btree" ("uploaded_by");



CREATE INDEX "idx_compliance_deadline" ON "public"."compliance_deadlines" USING "btree" ("deadline_date");



CREATE INDEX "idx_compliance_status" ON "public"."compliance_deadlines" USING "btree" ("status");



CREATE INDEX "idx_dashboard_snapshots_date" ON "public"."dashboard_snapshots" USING "btree" ("snapshot_date" DESC);



CREATE INDEX "idx_donations_campaign" ON "public"."donations" USING "btree" ("campaign_id") WHERE ("campaign_id" IS NOT NULL);



CREATE INDEX "idx_donations_designation" ON "public"."donations" USING "btree" ("designation", "donated_at");



CREATE INDEX "idx_donations_donated_at" ON "public"."donations" USING "btree" ("donated_at");



CREATE INDEX "idx_donations_donor" ON "public"."donations" USING "btree" ("donor_id");



CREATE INDEX "idx_donations_event" ON "public"."donations" USING "btree" ("event_id");



CREATE INDEX "idx_donations_receipt" ON "public"."donations" USING "btree" ("receipt_number") WHERE ("receipt_number" IS NOT NULL);



CREATE INDEX "idx_donations_status" ON "public"."donations" USING "btree" ("status");



CREATE INDEX "idx_donations_stripe_pi" ON "public"."donations" USING "btree" ("stripe_payment_intent_id") WHERE ("stripe_payment_intent_id" IS NOT NULL);



CREATE INDEX "idx_donations_stripe_session" ON "public"."donations" USING "btree" ("stripe_session_id") WHERE ("stripe_session_id" IS NOT NULL);



CREATE INDEX "idx_donations_tax_year" ON "public"."donations" USING "btree" ("tax_year", "donor_id");



CREATE INDEX "idx_donor_comm_donor" ON "public"."donor_communications" USING "btree" ("donor_id");



CREATE UNIQUE INDEX "idx_donor_comm_unique" ON "public"."donor_communications" USING "btree" ("donor_id", "channel", "category");



CREATE INDEX "idx_donor_comm_unsub" ON "public"."donor_communications" USING "btree" ("unsubscribe_token");



CREATE UNIQUE INDEX "idx_donors_auth_user_id" ON "public"."donors" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE INDEX "idx_donors_email" ON "public"."donors" USING "btree" ("email");



CREATE INDEX "idx_donors_last_donated" ON "public"."donors" USING "btree" ("last_donated_at" DESC);



CREATE INDEX "idx_donors_name" ON "public"."donors" USING "btree" ("last_name", "first_name");



CREATE INDEX "idx_donors_stripe_customer" ON "public"."donors" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "idx_donors_total_donated" ON "public"."donors" USING "btree" ("total_donated_cents" DESC);



CREATE INDEX "idx_event_attendees_donor" ON "public"."event_attendees" USING "btree" ("donor_id");



CREATE INDEX "idx_event_attendees_event" ON "public"."event_attendees" USING "btree" ("event_id");



CREATE INDEX "idx_filings_type_year" ON "public"."compliance_filings" USING "btree" ("filing_type", "tax_year");



CREATE INDEX "idx_grant_reports_due" ON "public"."grant_reports" USING "btree" ("due_date", "status");



CREATE INDEX "idx_grant_reports_grant" ON "public"."grant_reports" USING "btree" ("grant_id");



CREATE INDEX "idx_grants_next_report" ON "public"."grants" USING "btree" ("next_report_due") WHERE ("next_report_due" IS NOT NULL);



CREATE INDEX "idx_grants_status" ON "public"."grants" USING "btree" ("status");



CREATE INDEX "idx_inkind_category" ON "public"."in_kind_donations" USING "btree" ("category");



CREATE INDEX "idx_inkind_donor" ON "public"."in_kind_donations" USING "btree" ("donor_id");



CREATE INDEX "idx_matching_gift_companies_name" ON "public"."matching_gift_companies" USING "btree" ("company_name");



CREATE INDEX "idx_matching_gifts_donation" ON "public"."matching_gifts" USING "btree" ("donation_id");



CREATE INDEX "idx_matching_gifts_donor" ON "public"."matching_gifts" USING "btree" ("donor_id");



CREATE INDEX "idx_matching_gifts_status" ON "public"."matching_gifts" USING "btree" ("status");



CREATE INDEX "idx_pledges_donor" ON "public"."pledges" USING "btree" ("donor_id");



CREATE INDEX "idx_pledges_status" ON "public"."pledges" USING "btree" ("status");



CREATE INDEX "idx_receipts_donation" ON "public"."donation_receipts" USING "btree" ("donation_id") WHERE ("donation_id" IS NOT NULL);



CREATE INDEX "idx_receipts_donor" ON "public"."donation_receipts" USING "btree" ("donor_id");



CREATE INDEX "idx_receipts_tax_year" ON "public"."donation_receipts" USING "btree" ("tax_year", "donor_id");



CREATE INDEX "idx_receipts_type" ON "public"."donation_receipts" USING "btree" ("receipt_type");



CREATE INDEX "idx_recurring_donor" ON "public"."recurring_donations" USING "btree" ("donor_id");



CREATE INDEX "idx_recurring_status" ON "public"."recurring_donations" USING "btree" ("status");



CREATE INDEX "idx_recurring_stripe_sub" ON "public"."recurring_donations" USING "btree" ("stripe_subscription_id");



CREATE UNIQUE INDEX "idx_state_reg_code" ON "public"."state_registrations" USING "btree" ("state_code");



CREATE OR REPLACE TRIGGER "applications_updated_at" BEFORE UPDATE ON "public"."applications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "company_files_updated_at" BEFORE UPDATE ON "public"."company_files" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "email_templates_updated_at" BEFORE UPDATE ON "public"."email_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "employee_profiles_updated_at" BEFORE UPDATE ON "public"."employee_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_donation_tax_year" BEFORE INSERT OR UPDATE OF "donated_at" ON "public"."donations" FOR EACH ROW EXECUTE FUNCTION "public"."set_donation_tax_year"();



CREATE OR REPLACE TRIGGER "trg_donors_updated_at" BEFORE UPDATE ON "public"."donors" FOR EACH ROW EXECUTE FUNCTION "public"."update_donors_updated_at"();



CREATE OR REPLACE TRIGGER "trg_inkind_tax_year" BEFORE INSERT OR UPDATE OF "donated_at" ON "public"."in_kind_donations" FOR EACH ROW EXECUTE FUNCTION "public"."set_inkind_tax_year"();



CREATE OR REPLACE TRIGGER "trg_update_campaign_totals" AFTER INSERT OR UPDATE OF "status" ON "public"."donations" FOR EACH ROW EXECUTE FUNCTION "public"."update_campaign_totals"();



CREATE OR REPLACE TRIGGER "trg_update_donor_totals" AFTER INSERT OR UPDATE OF "status" ON "public"."donations" FOR EACH ROW EXECUTE FUNCTION "public"."update_donor_totals"();



ALTER TABLE ONLY "public"."acknowledgment_letters"
    ADD CONSTRAINT "acknowledgment_letters_donation_id_fkey" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."acknowledgment_letters"
    ADD CONSTRAINT "acknowledgment_letters_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."employee_profiles"("id");



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."employee_profiles"("id");



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."employee_profiles"("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."employee_profiles"("id");



ALTER TABLE ONLY "public"."company_files"
    ADD CONSTRAINT "company_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."employee_profiles"("id");



ALTER TABLE ONLY "public"."compliance_alert_log"
    ADD CONSTRAINT "compliance_alert_log_deadline_id_fkey" FOREIGN KEY ("deadline_id") REFERENCES "public"."compliance_deadlines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."donation_receipts"
    ADD CONSTRAINT "donation_receipts_donation_id_fkey" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."donation_receipts"
    ADD CONSTRAINT "donation_receipts_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "donations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id");



ALTER TABLE ONLY "public"."donor_communications"
    ADD CONSTRAINT "donor_communications_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."donor_verification_log"
    ADD CONSTRAINT "donor_verification_log_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."donors"
    ADD CONSTRAINT "donors_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."email_send_log"
    ADD CONSTRAINT "email_send_log_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "public"."employee_profiles"("id");



ALTER TABLE ONLY "public"."email_send_log"
    ADD CONSTRAINT "email_send_log_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id");



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employee_profiles"("id");



ALTER TABLE ONLY "public"."employee_profiles"
    ADD CONSTRAINT "employee_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_attendees"
    ADD CONSTRAINT "event_attendees_donation_id_fkey" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id");



ALTER TABLE ONLY "public"."event_attendees"
    ADD CONSTRAINT "event_attendees_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id");



ALTER TABLE ONLY "public"."event_attendees"
    ADD CONSTRAINT "event_attendees_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."donations"
    ADD CONSTRAINT "fk_donations_campaign" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."grant_reports"
    ADD CONSTRAINT "grant_reports_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."in_kind_donations"
    ADD CONSTRAINT "in_kind_donations_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."matching_gifts"
    ADD CONSTRAINT "matching_gifts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."matching_gift_companies"("id");



ALTER TABLE ONLY "public"."matching_gifts"
    ADD CONSTRAINT "matching_gifts_donation_id_fkey" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id");



ALTER TABLE ONLY "public"."matching_gifts"
    ADD CONSTRAINT "matching_gifts_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id");



ALTER TABLE ONLY "public"."pledges"
    ADD CONSTRAINT "pledges_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."recurring_donations"
    ADD CONSTRAINT "recurring_donations_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE RESTRICT;



CREATE POLICY "Admin and manager full access" ON "public"."compliance_alert_log" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE (("admin_users"."auth_user_id" = "auth"."uid"()) AND ("admin_users"."is_active" = true) AND ("admin_users"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'finance'::"text"]))))));



CREATE POLICY "Admin and manager full access" ON "public"."event_attendees" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE (("admin_users"."auth_user_id" = "auth"."uid"()) AND ("admin_users"."is_active" = true) AND ("admin_users"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'finance'::"text"]))))));



CREATE POLICY "Admin and manager full access" ON "public"."matching_gift_companies" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE (("admin_users"."auth_user_id" = "auth"."uid"()) AND ("admin_users"."is_active" = true) AND ("admin_users"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'finance'::"text"]))))));



CREATE POLICY "Admin and manager full access" ON "public"."matching_gifts" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE (("admin_users"."auth_user_id" = "auth"."uid"()) AND ("admin_users"."is_active" = true) AND ("admin_users"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text", 'finance'::"text"]))))));



CREATE POLICY "Admin users can read own record" ON "public"."admin_users" FOR SELECT USING (("auth"."uid"() = "auth_user_id"));



CREATE POLICY "Admins and managers can manage acknowledgment_letters" ON "public"."acknowledgment_letters" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"]))))));



CREATE POLICY "Admins and managers can manage campaigns" ON "public"."campaigns" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"]))))));



CREATE POLICY "Admins and managers can manage compliance deadlines" ON "public"."compliance_deadlines" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"]))))));



CREATE POLICY "Admins and managers can manage compliance filings" ON "public"."compliance_filings" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"]))))));



CREATE POLICY "Admins and managers can manage donations" ON "public"."donations" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"]))))));



CREATE POLICY "Admins and managers can manage donor_communications" ON "public"."donor_communications" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"]))))));



CREATE POLICY "Admins and managers can manage donors" ON "public"."donors" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"]))))));



CREATE POLICY "Admins and managers can manage events" ON "public"."events" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"]))))));



CREATE POLICY "Admins and managers can manage grants" ON "public"."grants" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"]))))));



CREATE POLICY "Admins and managers can manage in_kind_donations" ON "public"."in_kind_donations" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"]))))));



CREATE POLICY "Admins and managers can manage pledges" ON "public"."pledges" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"]))))));



CREATE POLICY "Admins and managers can manage receipts" ON "public"."donation_receipts" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"]))))));



CREATE POLICY "Admins and managers can manage recurring donations" ON "public"."recurring_donations" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"]))))));



CREATE POLICY "Admins and managers can manage state_registrations" ON "public"."state_registrations" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"]))))));



CREATE POLICY "Admins and managers can manage system_config" ON "public"."system_config" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"]))))));



CREATE POLICY "Admins can manage all applications" ON "public"."applications" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = 'admin'::"public"."employee_role")))));



CREATE POLICY "Admins can manage all files" ON "public"."company_files" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = 'admin'::"public"."employee_role")))));



CREATE POLICY "Admins can manage all profiles" ON "public"."employee_profiles" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles" "employee_profiles_1"
  WHERE (("employee_profiles_1"."id" = "auth"."uid"()) AND ("employee_profiles_1"."role" = 'admin'::"public"."employee_role")))));



CREATE POLICY "Admins can manage templates" ON "public"."email_templates" USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = 'admin'::"public"."employee_role")))));



CREATE POLICY "Admins can view all email logs" ON "public"."email_send_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = 'admin'::"public"."employee_role")))));



CREATE POLICY "Admins can view audit logs" ON "public"."audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = 'admin'::"public"."employee_role")))));



CREATE POLICY "Anyone can view active campaigns" ON "public"."campaigns" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view active events" ON "public"."events" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Authenticated users can create audit entries" ON "public"."audit_log" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Employees can upload files" ON "public"."company_files" FOR INSERT WITH CHECK (("auth"."uid"() = "uploaded_by"));



CREATE POLICY "Employees can view active profiles" ON "public"."employee_profiles" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("status" = 'active'::"public"."employee_status")));



CREATE POLICY "Employees can view active templates" ON "public"."email_templates" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("is_active" = true)));



CREATE POLICY "Employees can view department files" ON "public"."company_files" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("status" = 'active'::"public"."file_status") AND ("access_level" = 'department'::"public"."file_access_level") AND ("department" = ( SELECT "employee_profiles"."department"
   FROM "public"."employee_profiles"
  WHERE ("employee_profiles"."id" = "auth"."uid"())))));



CREATE POLICY "Employees can view public files" ON "public"."company_files" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("status" = 'active'::"public"."file_status") AND ("access_level" = 'public'::"public"."file_access_level")));



CREATE POLICY "Managers can update assigned applications" ON "public"."applications" FOR UPDATE USING ((("auth"."uid"() = "assigned_to") OR (EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"])))))));



CREATE POLICY "Managers can view assigned applications" ON "public"."applications" FOR SELECT USING ((("auth"."uid"() = "assigned_to") OR (EXISTS ( SELECT 1
   FROM "public"."employee_profiles"
  WHERE (("employee_profiles"."id" = "auth"."uid"()) AND ("employee_profiles"."role" = ANY (ARRAY['admin'::"public"."employee_role", 'manager'::"public"."employee_role"])))))));



CREATE POLICY "Service role full access to admin_audit_log" ON "public"."admin_audit_log" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access to admin_users" ON "public"."admin_users" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access to dashboard_snapshots" ON "public"."dashboard_snapshots" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Uploaders can update own files" ON "public"."company_files" FOR UPDATE USING (("auth"."uid"() = "uploaded_by"));



CREATE POLICY "Uploaders can view own files" ON "public"."company_files" FOR SELECT USING (("auth"."uid"() = "uploaded_by"));



CREATE POLICY "Users can create applications" ON "public"."applications" FOR INSERT WITH CHECK (("auth"."uid"() = "submitted_by"));



CREATE POLICY "Users can create send log entries" ON "public"."email_send_log" FOR INSERT WITH CHECK (("auth"."uid"() = "sent_by"));



CREATE POLICY "Users can update own draft applications" ON "public"."applications" FOR UPDATE USING ((("auth"."uid"() = "submitted_by") AND ("status" = 'draft'::"public"."application_status"))) WITH CHECK (("auth"."uid"() = "submitted_by"));



CREATE POLICY "Users can update own profile" ON "public"."employee_profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own applications" ON "public"."applications" FOR SELECT USING (("auth"."uid"() = "submitted_by"));



CREATE POLICY "Users can view own profile" ON "public"."employee_profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own sent emails" ON "public"."email_send_log" FOR SELECT USING (("auth"."uid"() = "sent_by"));



ALTER TABLE "public"."acknowledgment_letters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compliance_alert_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "compliance_alert_log_admin_read" ON "public"."compliance_alert_log" FOR SELECT TO "authenticated" USING ("public"."is_admin_user"());



CREATE POLICY "compliance_alert_log_service_insert" ON "public"."compliance_alert_log" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_user"());



ALTER TABLE "public"."compliance_deadlines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compliance_filings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dashboard_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."donation_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."donations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "donations_donor_read" ON "public"."donations" FOR SELECT USING (("donor_id" = "public"."get_donor_id_for_auth_user"()));



ALTER TABLE "public"."donor_communications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."donor_verification_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."donors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "donors_self_read" ON "public"."donors" FOR SELECT USING (("auth_user_id" = "auth"."uid"()));



CREATE POLICY "donors_self_update" ON "public"."donors" FOR UPDATE USING (("auth_user_id" = "auth"."uid"()));



CREATE POLICY "dvl_donor_read" ON "public"."donor_verification_log" FOR SELECT USING (("donor_id" = "public"."get_donor_id_for_auth_user"()));



ALTER TABLE "public"."email_send_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_attendees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."grant_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "grant_reports_admin_delete" ON "public"."grant_reports" FOR DELETE TO "authenticated" USING ("public"."is_admin_user"());



CREATE POLICY "grant_reports_admin_insert" ON "public"."grant_reports" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "grant_reports_admin_read" ON "public"."grant_reports" FOR SELECT TO "authenticated" USING ("public"."is_admin_user"());



CREATE POLICY "grant_reports_admin_update" ON "public"."grant_reports" FOR UPDATE TO "authenticated" USING ("public"."is_admin_user"());



ALTER TABLE "public"."grants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."in_kind_donations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matching_gift_companies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "matching_gift_companies_donor_read" ON "public"."matching_gift_companies" FOR SELECT USING (true);



ALTER TABLE "public"."matching_gifts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "matching_gifts_donor_read" ON "public"."matching_gifts" FOR SELECT USING (("donor_id" = "public"."get_donor_id_for_auth_user"()));



ALTER TABLE "public"."pledges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pledges_donor_read" ON "public"."pledges" FOR SELECT USING (("donor_id" = "public"."get_donor_id_for_auth_user"()));



CREATE POLICY "receipts_donor_read" ON "public"."donation_receipts" FOR SELECT USING (("donor_id" = "public"."get_donor_id_for_auth_user"()));



ALTER TABLE "public"."recurring_donations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recurring_donor_read" ON "public"."recurring_donations" FOR SELECT USING (("donor_id" = "public"."get_donor_id_for_auth_user"()));



ALTER TABLE "public"."state_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_config" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "qa_readonly";



REVOKE ALL ON FUNCTION "public"."generate_receipt_number"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_receipt_number"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_donor_id_for_auth_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_donor_id_for_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_donor_id_for_auth_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_donation_tax_year"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_donation_tax_year"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_inkind_tax_year"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_inkind_tax_year"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_campaign_totals"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_campaign_totals"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_donor_totals"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_donor_totals"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_donors_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_donors_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."acknowledgment_letters" TO "anon";
GRANT ALL ON TABLE "public"."acknowledgment_letters" TO "authenticated";
GRANT ALL ON TABLE "public"."acknowledgment_letters" TO "service_role";
GRANT SELECT ON TABLE "public"."acknowledgment_letters" TO "qa_readonly";



GRANT ALL ON TABLE "public"."admin_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "service_role";
GRANT SELECT ON TABLE "public"."admin_audit_log" TO "qa_readonly";



GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";
GRANT SELECT ON TABLE "public"."admin_users" TO "qa_readonly";



GRANT ALL ON TABLE "public"."applications" TO "anon";
GRANT ALL ON TABLE "public"."applications" TO "authenticated";
GRANT ALL ON TABLE "public"."applications" TO "service_role";
GRANT SELECT ON TABLE "public"."applications" TO "qa_readonly";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";
GRANT SELECT ON TABLE "public"."audit_log" TO "qa_readonly";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";
GRANT SELECT ON TABLE "public"."campaigns" TO "qa_readonly";



GRANT ALL ON TABLE "public"."company_files" TO "anon";
GRANT ALL ON TABLE "public"."company_files" TO "authenticated";
GRANT ALL ON TABLE "public"."company_files" TO "service_role";
GRANT SELECT ON TABLE "public"."company_files" TO "qa_readonly";



GRANT ALL ON TABLE "public"."compliance_alert_log" TO "anon";
GRANT ALL ON TABLE "public"."compliance_alert_log" TO "authenticated";
GRANT ALL ON TABLE "public"."compliance_alert_log" TO "service_role";
GRANT SELECT ON TABLE "public"."compliance_alert_log" TO "qa_readonly";



GRANT ALL ON TABLE "public"."compliance_deadlines" TO "anon";
GRANT ALL ON TABLE "public"."compliance_deadlines" TO "authenticated";
GRANT ALL ON TABLE "public"."compliance_deadlines" TO "service_role";
GRANT SELECT ON TABLE "public"."compliance_deadlines" TO "qa_readonly";



GRANT ALL ON TABLE "public"."compliance_filings" TO "anon";
GRANT ALL ON TABLE "public"."compliance_filings" TO "authenticated";
GRANT ALL ON TABLE "public"."compliance_filings" TO "service_role";
GRANT SELECT ON TABLE "public"."compliance_filings" TO "qa_readonly";



GRANT ALL ON TABLE "public"."dashboard_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_snapshots" TO "service_role";
GRANT SELECT ON TABLE "public"."dashboard_snapshots" TO "qa_readonly";



GRANT ALL ON TABLE "public"."donation_receipts" TO "anon";
GRANT ALL ON TABLE "public"."donation_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."donation_receipts" TO "service_role";
GRANT SELECT ON TABLE "public"."donation_receipts" TO "qa_readonly";



GRANT ALL ON TABLE "public"."donations" TO "anon";
GRANT ALL ON TABLE "public"."donations" TO "authenticated";
GRANT ALL ON TABLE "public"."donations" TO "service_role";
GRANT SELECT ON TABLE "public"."donations" TO "qa_readonly";



GRANT ALL ON TABLE "public"."donor_communications" TO "anon";
GRANT ALL ON TABLE "public"."donor_communications" TO "authenticated";
GRANT ALL ON TABLE "public"."donor_communications" TO "service_role";
GRANT SELECT ON TABLE "public"."donor_communications" TO "qa_readonly";



GRANT ALL ON TABLE "public"."donor_verification_log" TO "anon";
GRANT ALL ON TABLE "public"."donor_verification_log" TO "authenticated";
GRANT ALL ON TABLE "public"."donor_verification_log" TO "service_role";
GRANT SELECT ON TABLE "public"."donor_verification_log" TO "qa_readonly";



GRANT ALL ON TABLE "public"."donors" TO "anon";
GRANT ALL ON TABLE "public"."donors" TO "authenticated";
GRANT ALL ON TABLE "public"."donors" TO "service_role";
GRANT SELECT ON TABLE "public"."donors" TO "qa_readonly";



GRANT ALL ON TABLE "public"."email_send_log" TO "anon";
GRANT ALL ON TABLE "public"."email_send_log" TO "authenticated";
GRANT ALL ON TABLE "public"."email_send_log" TO "service_role";
GRANT SELECT ON TABLE "public"."email_send_log" TO "qa_readonly";



GRANT ALL ON TABLE "public"."email_templates" TO "anon";
GRANT ALL ON TABLE "public"."email_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."email_templates" TO "service_role";
GRANT SELECT ON TABLE "public"."email_templates" TO "qa_readonly";



GRANT ALL ON TABLE "public"."employee_profiles" TO "anon";
GRANT ALL ON TABLE "public"."employee_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."employee_profiles" TO "qa_readonly";



GRANT ALL ON TABLE "public"."event_attendees" TO "anon";
GRANT ALL ON TABLE "public"."event_attendees" TO "authenticated";
GRANT ALL ON TABLE "public"."event_attendees" TO "service_role";
GRANT SELECT ON TABLE "public"."event_attendees" TO "qa_readonly";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";
GRANT SELECT ON TABLE "public"."events" TO "qa_readonly";



GRANT ALL ON TABLE "public"."grant_reports" TO "anon";
GRANT ALL ON TABLE "public"."grant_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."grant_reports" TO "service_role";
GRANT SELECT ON TABLE "public"."grant_reports" TO "qa_readonly";



GRANT ALL ON TABLE "public"."grants" TO "anon";
GRANT ALL ON TABLE "public"."grants" TO "authenticated";
GRANT ALL ON TABLE "public"."grants" TO "service_role";
GRANT SELECT ON TABLE "public"."grants" TO "qa_readonly";



GRANT ALL ON TABLE "public"."in_kind_donations" TO "anon";
GRANT ALL ON TABLE "public"."in_kind_donations" TO "authenticated";
GRANT ALL ON TABLE "public"."in_kind_donations" TO "service_role";
GRANT SELECT ON TABLE "public"."in_kind_donations" TO "qa_readonly";



GRANT ALL ON TABLE "public"."matching_gift_companies" TO "anon";
GRANT ALL ON TABLE "public"."matching_gift_companies" TO "authenticated";
GRANT ALL ON TABLE "public"."matching_gift_companies" TO "service_role";
GRANT SELECT ON TABLE "public"."matching_gift_companies" TO "qa_readonly";



GRANT ALL ON TABLE "public"."matching_gifts" TO "anon";
GRANT ALL ON TABLE "public"."matching_gifts" TO "authenticated";
GRANT ALL ON TABLE "public"."matching_gifts" TO "service_role";
GRANT SELECT ON TABLE "public"."matching_gifts" TO "qa_readonly";



GRANT ALL ON TABLE "public"."pledges" TO "anon";
GRANT ALL ON TABLE "public"."pledges" TO "authenticated";
GRANT ALL ON TABLE "public"."pledges" TO "service_role";
GRANT SELECT ON TABLE "public"."pledges" TO "qa_readonly";



GRANT ALL ON SEQUENCE "public"."receipt_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."receipt_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."receipt_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_donations" TO "anon";
GRANT ALL ON TABLE "public"."recurring_donations" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_donations" TO "service_role";
GRANT SELECT ON TABLE "public"."recurring_donations" TO "qa_readonly";



GRANT ALL ON TABLE "public"."state_registrations" TO "anon";
GRANT ALL ON TABLE "public"."state_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."state_registrations" TO "service_role";
GRANT SELECT ON TABLE "public"."state_registrations" TO "qa_readonly";



GRANT ALL ON TABLE "public"."system_config" TO "anon";
GRANT ALL ON TABLE "public"."system_config" TO "authenticated";
GRANT ALL ON TABLE "public"."system_config" TO "service_role";
GRANT SELECT ON TABLE "public"."system_config" TO "qa_readonly";



GRANT ALL ON TABLE "public"."v_donation_summary" TO "service_role";
GRANT SELECT ON TABLE "public"."v_donation_summary" TO "qa_readonly";



GRANT ALL ON TABLE "public"."v_monthly_totals" TO "service_role";
GRANT SELECT ON TABLE "public"."v_monthly_totals" TO "qa_readonly";



GRANT ALL ON TABLE "public"."v_recent_donations" TO "service_role";
GRANT SELECT ON TABLE "public"."v_recent_donations" TO "qa_readonly";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON TABLES TO "qa_readonly";









-- ACL reconciliation. A fresh Supabase project grants anon and authenticated on every new
-- function and view through default privileges, and pg_dump does not revoke those. These
-- statements bring a fresh project to production's ACLs (same effect as the earlier migrations
-- revoke_definer_execute_internal, revoke_anon_rls_helpers and restrict_donation_views_to_service_role).
REVOKE EXECUTE ON FUNCTION public.generate_receipt_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_donation_tax_year() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_inkind_tax_year() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_campaign_totals() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_donor_totals() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_donors_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_receipt_number() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_donor_id_for_auth_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_donor_id_for_auth_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated, service_role;

REVOKE ALL ON public.v_recent_donations FROM anon, authenticated;
REVOKE ALL ON public.v_donation_summary FROM anon, authenticated;
REVOKE ALL ON public.v_monthly_totals FROM anon, authenticated;

-- Config rows that the former migration audit_gap_fixes (20260317000000) seeded. The schema-only
-- dump has no rows, so they are restored here. Production already has them.
INSERT INTO public.system_config (key, value, description)
VALUES (
  'receipt_url_expiry',
  '{"single_seconds": 300, "bulk_seconds": 600}'::jsonb,
  'Signed URL expiry times for receipt downloads'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.system_config (key, value, description)
VALUES (
  'account_mappings_schema',
  '{"required_keys": ["_default_income", "_default_bank"], "optional_keys": ["_inkind", "_default_income_code"], "designation_prefix": "", "xero_prefix": "xero_", "description": "Map designation names to account names/codes. Prefix xero_ keys for Xero-specific codes."}'::jsonb,
  'Schema documentation for account_mappings config'
)
ON CONFLICT (key) DO NOTHING;
