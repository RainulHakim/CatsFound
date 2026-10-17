-- Private photo bucket. No storage.objects policies are granted to anon or
-- authenticated, so the only way to read a photo is a 15-minute signed URL
-- minted by server code after an RLS-checked query returned that photo's path.
-- Uploads are service-role only, after the server-side re-encode pipeline.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 5242880, array['image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
