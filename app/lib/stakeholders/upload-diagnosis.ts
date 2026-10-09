/* Works out WHY a speaker's submit failed, from what the browser can see, so the form can say something useful
   instead of "please try again" (2026-10-09, after Glen Fernandes's corporate network blocked a passport upload —
   the POST never reached the server). Pure + client-safe. Everything here is inference: the wording says "appears". */

export type UploadFailureKind =
  | 'server'        // our API answered with its own JSON error — show it as-is
  | 'too_large'     // 413 from an upstream proxy (not our JSON)
  | 'blocked'       // a non-JSON reply (HTML block page, 403, 5xx from a gateway) or nothing got through at all
  | 'network'       // the request never completed and a tiny test upload ALSO fails: connection / uploads blocked
  | 'files_blocked' // the request failed but a tiny test upload passes: the files themselves (size / ID scanning) are the likely problem

export type UploadFailureInput = {
  threw: boolean               // fetch rejected (no HTTP response at all)
  status: number | null
  jsonError: string | null     // the `error` string from our own JSON body, if there was one
  pingOk: boolean | null       // did a tiny harmless test upload to our server succeed? null = not tested
}

export function classifyUploadFailure(i: UploadFailureInput): UploadFailureKind {
  if (i.jsonError) return 'server'
  if (i.status === 413) return 'too_large'
  if (i.pingOk === false) return 'network'
  if (i.pingOk === true) return 'files_blocked'
  return i.threw ? 'network' : 'blocked'
}

/** Speaker-facing message. `producerEmail` is who sent them the request (the email fallback). */
export function uploadFailureMessage(kind: UploadFailureKind, serverError: string | null, producerEmail: string | null): string {
  const fallback = producerEmail ? ` If it keeps failing, you can email the files to ${producerEmail} instead and we will add them for you.` : ' If it keeps failing, reply to the email we sent you with the files attached and we will add them for you.'
  switch (kind) {
    case 'server': return serverError || 'Could not submit — please try again.'
    case 'too_large': return `One of the files appears to be too large for the upload. Try a smaller scan or photo (under 20 MB for documents, 5 MB for photos).${fallback}`
    case 'files_blocked': return `Your connection works, but the upload of these files appears to have been blocked — often a size limit or security software that scans identity documents. Try uploading one document at a time, or use a personal device or mobile data instead of a work network.${fallback}`
    case 'network': return `We could not reach our server to upload. Your network or security software appears to be blocking uploads from this device. Try a personal device or mobile data instead of a work network, then submit again.${fallback}`
    case 'blocked': return `The upload was stopped before it reached us — something on your network (for example a company firewall) appears to be blocking it. Try a personal device or mobile data, or upload one document at a time.${fallback}`
  }
}
