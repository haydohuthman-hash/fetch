/**
 * After Supabase sign-in (including OAuth return), decide whether to leave home/splash
 * and send the user through profile handle + platform onboarding like email sign-in.
 */

import { needsDropsCreatorOnboarding } from './drops/fetchDropsCreatorOnboarding'
import { needsPlatformOnboarding } from './fetchPlatformIdentity'
import { loadSession } from './fetchUserSession'
import { isAutomaticDefaultUsername } from './supabase/profiles'

/** Next route after auth when session cache is ready. */
export type PostAuthRoutePhase = 'auth' | 'home' | 'onboarding' | 'dropsSetup'

/**
 * When session cache is populated and user is signed in, returns the phase to show.
 * Profile setup is mandatory before the rest of the app.
 *
 * Order: username/profile gate → platform onboarding → Drops setup → otherwise `home`.
 */
export function computePostAuthAppPhase(): PostAuthRoutePhase | null {
  console.log('[AUTH] computePostAuthAppPhase start')
  const s = loadSession()
  if (!s?.email?.trim()) {
    // #region agent log
    fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchPostAuthRouting.ts:compute',message:'postAuth null no email',data:{hasSession:Boolean(s),hypothesisId:'H2'},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    console.log('[AUTH] computePostAuthAppPhase result:', null, { reason: 'no_email' })
    return null
  }

  const u = s.username?.trim()
  if (!u || isAutomaticDefaultUsername(u, s.id)) {
    console.log('[AUTH] authenticated without profile redirect blocked')
    // #region agent log
    fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchPostAuthRouting.ts:compute',message:'postAuth auth',data:{hypothesisId:'H2'},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    console.log('[AUTH] computePostAuthAppPhase result:', 'auth', { reason: 'username_pending_mandatory' })
    return 'auth'
  }
  if (needsPlatformOnboarding()) {
    // #region agent log
    fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchPostAuthRouting.ts:compute',message:'postAuth onboarding',data:{hypothesisId:'H2'},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    console.log('[AUTH] computePostAuthAppPhase result:', 'onboarding')
    return 'onboarding'
  }
  if (needsDropsCreatorOnboarding()) {
    // #region agent log
    fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchPostAuthRouting.ts:compute',message:'postAuth dropsSetup',data:{hypothesisId:'H2'},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    console.log('[AUTH] computePostAuthAppPhase result:', 'dropsSetup')
    return 'dropsSetup'
  }
  // #region agent log
  fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchPostAuthRouting.ts:compute',message:'postAuth null complete',data:{hypothesisId:'H2'},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  console.log('[AUTH] computePostAuthAppPhase result:', 'home', { reason: 'complete' })
  return 'home'
}
