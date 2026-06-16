create table public.short_links (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    target_url text not null,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    clicks int not null default 0,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create index idx_short_links_slug on public.short_links(slug);

grant select on public.short_links to anon;
grant select, insert, update, delete on public.short_links to authenticated;
grant all on public.short_links to service_role;

alter table public.short_links enable row level security;

create policy "Anyone can read short links"
on public.short_links
for select
to anon
using (true);

create policy "Users can manage their own short links"
on public.short_links
for all
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "Admins can manage all short links"
on public.short_links
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));