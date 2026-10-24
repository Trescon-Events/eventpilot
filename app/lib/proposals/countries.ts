/* Country → flag for Speaker Proposals. The flags are the MIT-licensed "flag-icons" set (4:3 SVGs), stored once in public/flags/<iso2>.svg — nothing is searched or downloaded per speaker.
   A speaker's country or nationality as typed in a sheet ("UAE", "AUS", "German", "United States") is turned into an ISO code here; anything we can't read confidently returns null (no flag, flagged for a human) rather than a guess. */

export const FLAG_CODES = ['ad','ae','af','ag','ai','al','am','ao','aq','ar','as','at','au','aw','ax','az','ba','bb','bd','be','bf','bg','bh','bi','bj','bl','bm','bn','bo','bq','br','bs','bt','bv','bw','by','bz','ca','cc','cd','cf','cg','ch','ci','ck','cl','cm','cn','co','cr','cu','cv','cw','cx','cy','cz','de','dj','dk','dm','do','dz','ec','ee','eg','eh','er','es','et','fi','fj','fk','fm','fo','fr','ga','gb','gd','ge','gf','gg','gh','gi','gl','gm','gn','gp','gq','gr','gs','gt','gu','gw','gy','hk','hm','hn','hr','ht','hu','id','ie','il','im','in','io','iq','ir','is','it','je','jm','jo','jp','ke','kg','kh','ki','km','kn','kp','kr','kw','ky','kz','la','lb','lc','li','lk','lr','ls','lt','lu','lv','ly','ma','mc','md','me','mf','mg','mh','mk','ml','mm','mn','mo','mp','mq','mr','ms','mt','mu','mv','mw','mx','my','mz','na','nc','ne','nf','ng','ni','nl','no','np','nr','nu','nz','om','pa','pe','pf','pg','ph','pk','pl','pm','pn','pr','ps','pt','pw','py','qa','re','ro','rs','ru','rw','sa','sb','sc','sd','se','sg','sh','si','sj','sk','sl','sm','sn','so','sr','ss','st','sv','sx','sy','sz','tc','td','tf','tg','th','tj','tk','tl','tm','tn','to','tr','tt','tv','tw','tz','ua','ug','um','us','uy','uz','va','vc','ve','vg','vi','vn','vu','wf','ws','ye','yt','za','zm','zw'] as const

const ALIASES: Record<string, string> = {
  uae: 'ae', emirates: 'ae', emirati: 'ae', 'united arab emirates': 'ae', usa: 'us', 'u s a': 'us', 'u s': 'us', america: 'us', american: 'us', 'united states of america': 'us',
  uk: 'gb', 'u k': 'gb', britain: 'gb', british: 'gb', england: 'gb', english: 'gb', scotland: 'gb', scottish: 'gb', wales: 'gb', welsh: 'gb', 'great britain': 'gb', 'united kingdom': 'gb',
  aus: 'au', australian: 'au', indian: 'in', german: 'de', germany: 'de', french: 'fr', belgian: 'be', egyptian: 'eg', saudi: 'sa', 'saudi arabian': 'sa', ksa: 'sa', kuwaiti: 'kw', qatari: 'qa', bahraini: 'bh', omani: 'om',
  jordanian: 'jo', lebanese: 'lb', iraqi: 'iq', syrian: 'sy', yemeni: 'ye', moroccan: 'ma', algerian: 'dz', tunisian: 'tn', libyan: 'ly', sudanese: 'sd', turkish: 'tr', turkiye: 'tr', iranian: 'ir', pakistani: 'pk', bangladeshi: 'bd',
  'sri lankan': 'lk', nepali: 'np', afghan: 'af', chinese: 'cn', japanese: 'jp', korean: 'kr', 'south korean': 'kr', singaporean: 'sg', malaysian: 'my', indonesian: 'id', thai: 'th', vietnamese: 'vn', filipino: 'ph', philippine: 'ph',
  russian: 'ru', ukrainian: 'ua', polish: 'pl', czech: 'cz', slovak: 'sk', hungarian: 'hu', romanian: 'ro', bulgarian: 'bg', greek: 'gr', italian: 'it', spanish: 'es', portuguese: 'pt', dutch: 'nl', netherlands: 'nl', holland: 'nl',
  swiss: 'ch', austrian: 'at', swedish: 'se', norwegian: 'no', danish: 'dk', finnish: 'fi', icelandic: 'is', irish: 'ie', luxembourgish: 'lu', maltese: 'mt', cypriot: 'cy', croatian: 'hr', serbian: 'rs', slovenian: 'si', latvian: 'lv', lithuanian: 'lt', estonian: 'ee',
  canadian: 'ca', mexican: 'mx', brazilian: 'br', argentine: 'ar', argentinian: 'ar', chilean: 'cl', colombian: 'co', peruvian: 've', venezuelan: 've', 'south african': 'za', nigerian: 'ng', kenyan: 'ke', ghanaian: 'gh', ethiopian: 'et', rwandan: 'rw', ugandan: 'ug', tanzanian: 'tz',
  'new zealander': 'nz', kiwi: 'nz', israeli: 'il', palestinian: 'ps', kazakh: 'kz', uzbek: 'uz', azerbaijani: 'az', georgian: 'ge', armenian: 'am', 'czech republic': 'cz', russia: 'ru', turkey: 'tr', 'south korea': 'kr', 'north korea': 'kp', vietnam: 'vn', 'ivory coast': 'ci',
}

let _names: Map<string, string> | null = null
function regionNames(): Map<string, string> {
  if (_names) return _names
  const dn = new Intl.DisplayNames(['en'], { type: 'region' })
  _names = new Map()
  for (const code of FLAG_CODES) { try { const n = dn.of(code.toUpperCase()); if (n && n !== code.toUpperCase()) _names.set(norm(n), code) } catch { /* unknown region */ } }
  return _names
}
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()

/** ISO alpha-2 (lower case) for a country or nationality as typed, or null when it can't be read confidently. */
export function countryCode(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim()
  if (!raw) return null
  if (/^[A-Za-z]{2}$/.test(raw) && (FLAG_CODES as readonly string[]).includes(raw.toLowerCase())) return raw.toLowerCase()
  const n = norm(raw)
  return ALIASES[n] ?? regionNames().get(n) ?? null
}

export const flagPath = (code: string | null | undefined): string | null => (code && (FLAG_CODES as readonly string[]).includes(code.toLowerCase()) ? `/flags/${code.toLowerCase()}.svg` : null)
