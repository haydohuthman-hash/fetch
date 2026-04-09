/**
 * After Supabase sign-in (including OAuth return), decide whether to leave home/splash
 * and send the user through profile handle + platform onboarding like email sign-in.
 */

import { needsDropsCreatorOnboarding } from './drops/fetchDropsCreatorOnboarding'
import { needsPlatformOnboarding } from './fetchPlatformIdentity'
import { loadSession } from './fetchUserSession'
import { isAutomaticDefaultUsername } from './supabase/profiles'

export type PostAuthAppPhase = 'auth' | 'onboarding' | 'dropsSetup'

/**
 * When session cache is populated and user is signed in, returns the setup phase to show
 * next (or null = stay on home/splash/account).
 *
 * Order matches {@link AuthScreen} `onSuccess`: username → platform onboarding → Drops setup.
 */
export function computePostAuthAppPhase(): PostAuthAppPhase | null {
  const s = loadSession()
  if (!s?.email?.trim()) {
    // #region agent log
    fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchPostAuthRouting.ts:compute',message:'postAuth null no email',data:{hasSession:Boolean(s),hypothesisId:'H2'},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    return null
  }

  const u = s.username?.trim()
  if (!u || isAutomaticDefaultUsername(u, s.id)) {
    console.log('[AUTH] authenticated without profile redirect blocked')
    // #region agent log
    fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchPostAuthRouting.ts:compute',message:'postAuth auth',data:{hypothesisId:'H2'},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    return null
  }
  if (needsPlatformOnboarding()) {
    // #region agent log
    fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchPostAuthRouting.ts:compute',message:'postAuth onboarding',data:{hypothesisId:'H2'},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    return 'onboarding'
  }
  if (needsDropsCreatorOnboarding()) {
    // #region agent log
    fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchPostAuthRouting.ts:compute',message:'postAuth dropsSetup',data:{hypothesisId:'H2'},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    return 'dropsSetup'
  }
  // #region agent log
  fetch('http://127.0.0.1:7777/ingest/3e862786-2e70-43d9-82dd-0763e7cc410e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8e74d6'},body:JSON.stringify({sessionId:'8e74d6',location:'fetchPostAuthRouting.ts:compute',message:'postAuth null complete',data:{hypothesisId:'H2'},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  return null
}
