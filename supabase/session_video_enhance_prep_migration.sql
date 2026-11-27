-- Faster finals (2026-11-27): the slow clean-up analysis (exposure, camera-shake scan, sound clean-up + loudness) runs once right after the upload
-- is processed, in parallel with the transcript, and the final render reuses it. session_offset_s = where the talk starts in the final video
-- (intro + title card, minus the crossfades), so YouTube chapters (and later captions) line up with the finished video.
alter table session_videos add column if not exists enhance_prep jsonb;
alter table session_videos add column if not exists session_offset_s numeric;
alter table video_jobs drop constraint if exists video_jobs_kind_check;
alter table video_jobs add constraint video_jobs_kind_check
  check (kind in ('drive_import', 'ingest', 'transcribe', 'identify', 'text_pack', 'render_preview', 'render', 'cue_scan', 'youtube_upload', 'enhance_prep'));
