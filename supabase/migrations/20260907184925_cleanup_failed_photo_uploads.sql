-- Allow the browser to remove only failed uploads owned by the signed-in user.
-- Storage objects are deleted through the Storage API; this policy only grants
-- the narrowly scoped permission required by that API call.
drop policy if exists "complaint_photos_delete_own_folder" on storage.objects;

create policy "complaint_photos_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'complaint-photos'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
