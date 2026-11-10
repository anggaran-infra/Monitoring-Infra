-- Jalankan sekali di Supabase SQL Editor.
-- Akses riwayat bersifat pribadi per akun login (tidak otomatis dibagikan ke pengguna lain).
create extension if not exists pgcrypto;

create table if not exists public.fa_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  periode text not null default '',
  file_modified_at timestamptz,
  created_at timestamptz not null default now(),
  pdf_path text not null unique,
  report jsonb not null
);
create index if not exists fa_reports_owner_created_idx on public.fa_reports(user_id,created_at desc);
alter table public.fa_reports enable row level security;
revoke all on public.fa_reports from anon;
grant select,insert on public.fa_reports to authenticated;

drop policy if exists "fa_reports_select_own" on public.fa_reports;
create policy "fa_reports_select_own" on public.fa_reports
  for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists "fa_reports_insert_own" on public.fa_reports;
create policy "fa_reports_insert_own" on public.fa_reports
  for insert to authenticated with check (
    user_id=(select auth.uid())
    and pdf_path like ((select auth.uid())::text || '/%')
  );

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('fa-detail-pdf','fa-detail-pdf',false,15728640,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=15728640,allowed_mime_types=array['application/pdf'];

drop policy if exists "fa_storage_upload_own" on storage.objects;
create policy "fa_storage_upload_own" on storage.objects
  for insert to authenticated with check (
    bucket_id='fa-detail-pdf' and (storage.foldername(name))[1]=(select auth.uid())::text
  );
drop policy if exists "fa_storage_read_own" on storage.objects;
create policy "fa_storage_read_own" on storage.objects
  for select to authenticated using (
    bucket_id='fa-detail-pdf' and (storage.foldername(name))[1]=(select auth.uid())::text
  );
drop policy if exists "fa_storage_delete_own" on storage.objects;
create policy "fa_storage_delete_own" on storage.objects
  for delete to authenticated using (
    bucket_id='fa-detail-pdf' and (storage.foldername(name))[1]=(select auth.uid())::text
  );
