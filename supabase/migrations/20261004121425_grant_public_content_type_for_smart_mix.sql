-- The invoker-rights homepage tag RPC filters the public projection to story
-- content. Expose only the new public type discriminator alongside the
-- already granted public projection columns required by that RPC.
grant select (content_type) on table public.published_previews to anon, authenticated;
