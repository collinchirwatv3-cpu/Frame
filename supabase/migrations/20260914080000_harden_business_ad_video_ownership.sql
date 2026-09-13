-- FRAME — MEDIUM fix. campaigns_insert_own's `type = 'promote'` branch
-- correctly requires video_id to belong to the caller; the `type =
-- 'business_ad'` branch had no such constraint at all, so an approved
-- Business Channel could set video_id to a video it doesn't own via direct
-- PostgREST insert (no dedicated campaign-creation UI exists yet — this is
-- schema/RLS-only exposure, but reachable regardless of UI). video_id is
-- optional for business_ad (a pure banner ad need not reference one), so
-- only enforce ownership when it's actually set.
alter policy campaigns_insert_own on campaigns
  with check (
    owner_id = auth.uid()
    and is_invited(auth.uid())
    and (
      (
        type = 'business_ad'
        and status = 'pending_review'
        and is_business_approved(auth.uid())
        and (
          video_id is null
          or exists (select 1 from videos where videos.id = campaigns.video_id and videos.creator_id = auth.uid())
        )
      )
      or (
        type = 'promote'
        and status = 'pending_payment'
        and not is_business_approved(auth.uid())
        and exists (
          select 1 from videos
          where videos.id = campaigns.video_id and videos.creator_id = auth.uid()
        )
      )
    )
  );
