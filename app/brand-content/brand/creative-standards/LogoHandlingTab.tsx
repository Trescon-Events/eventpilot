import { Card } from '@/app/components/ui'

/* The logo rule lives in code only (app/lib/media/logo-engine.ts: processLogo, removeLogoBackground, buildCleanLogoBase, determineSafeArea),
   not in a setting, so this tab shows it read-only in plain words. Making it editable is a later build. Keep this text in step with the
   constants in logo-engine.ts if they change. */
const STEPS = [
  { title: 'Any file is accepted', body: 'PNG, JPEG, WebP, GIF, BMP, ICO, TIFF, HEIC, SVG, PDF, AI, PSD and EPS. Vector and layered files are turned into an image first.' },
  { title: 'The background is removed', body: 'When the logo sits on a plain white, black or grey background, that background is taken out. A logo with its own coloured plate or badge is left untouched.' },
  { title: 'It is trimmed and placed on a standard white canvas', body: 'Every processed logo ends up on a 600 by 300 pixel solid white canvas, centred, scaled up as large as it can go inside a safe area.' },
  { title: 'Padding is 40 pixels on every side', body: 'The safe area is 520 by 220 pixels.' },
  { title: 'One exception for wide logos', body: 'A logo that would touch the left and right edges and whose height is more than 30 percent of its width gets 80 pixels at the sides instead (safe area 440 by 220). Tall and square marks never trigger this.' },
  { title: 'Creatives reuse the clean logo', body: 'When a creative is generated, the clean 600 by 300 logo is fitted inside the logo box of the template and centred.' },
]

export default function LogoHandlingTab() {
  return (
    <div style={{ padding: '24px 0', maxWidth: '860px' }}>
      <Card padded>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
          The rule every logo goes through before it is used anywhere in EventPilot. It is set in code, so it is shown here for reference and cannot be edited on this page.
        </div>
        <ol style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '10px' }}>
          {STEPS.map(s => (
            <li key={s.title} style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--ink)' }}>{s.title}.</strong> {s.body}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
