-- Proof of task completion — photo/video/audio/document attachments.
-- tasks.requires_proof already existed in the original schema (section 5)
-- but nothing ever populated or read it; this wires it up for real.

alter table public.tasks add column proof_media_path text;
alter table public.tasks add column proof_media_type text
  check (proof_media_type is null or proof_media_type in ('photo', 'video', 'audio', 'doc'));

-- proof_media_path stores a Storage object path, not a public URL — the
-- bucket is private, and a fresh signed URL is generated at read time
-- (see app/tasks/data.ts) rather than persisting a URL that would
-- eventually expire or, if the bucket were public, stay permanently
-- accessible to anyone with the link.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-proofs',
  'task-proofs',
  false,
  10485760, -- 10MB — matches the app-side limit in next.config.mjs and app/tasks/actions.ts
  array[
    'image/*', 'video/*', 'audio/*',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects RLS policies here on purpose: only the service-role
-- admin client touches this bucket right now (same pre-auth stopgap as
-- every other table — see lib/access.ts), which bypasses storage RLS the
-- same way it bypasses table RLS. Add real per-user storage policies once
-- real auth exists and uploads start happening as the signed-in user.
