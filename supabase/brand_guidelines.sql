CREATE TABLE IF NOT EXISTS event_brand_guidelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  primary_color text DEFAULT '#0F1923',
  secondary_color text DEFAULT '#00A5A3',
  accent_color text DEFAULT '#C0F43C',
  background_color text DEFAULT '#FFFFFF',
  text_color text DEFAULT '#2D3E50',
  heading_font text DEFAULT 'Inter',
  body_font text DEFAULT 'Inter',
  tone text[] DEFAULT '{}',
  key_messages text[] DEFAULT '{}',
  style_keywords text[] DEFAULT '{}',
  logo_notes text,
  ai_reasoning text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(event_id)
);

CREATE TABLE IF NOT EXISTS event_brand_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  label text,
  prompt_used text,
  image_url text NOT NULL,
  aspect_ratio text,
  created_at timestamptz DEFAULT now()
);
