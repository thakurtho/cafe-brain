/**
 * Hand-written types for the pieces of the schema the app currently touches.
 * Once the CLI is linked to a real project, replace/extend this with generated
 * types via:
 *
 *   npx supabase gen types typescript --project-id <ref> --schema public > lib/supabase/database.types.ts
 *
 * and swap the `Database` generic below for the generated one.
 */
export type Database = Record<string, unknown>;
