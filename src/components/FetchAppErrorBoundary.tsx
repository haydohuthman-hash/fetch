import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

type State = { error: Error | null; retryNonce: number }

/**
 * Catches render errors in the app shell so post-auth redirects never show a silent blank screen.
 */
export class FetchAppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryNonce: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AUTH-CRASH] error boundary caught', error, info.componentStack)
  }

  private handleRetry = (): void => {
    this.setState((s) => ({ error: null, retryNonce: s.retryNonce + 1 }))
  }

  render(): ReactNode {
    if (this.state.error) {
      const msg = this.state.error.message || 'Unknown error'
      return (
        <div className="fetch-app-shell-bg flex min-h-dvh flex-col items-center justify-center px-6 text-center">
          <div className="max-w-md rounded-2xl border border-white/20 bg-black/60 px-6 py-8 text-white ring-1 ring-white/10">
            <h2 className="text-lg font-semibold tracking-tight">Let’s try that again</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-white/78">
              We hit a snag loading this part of Fetch. Your account is still fine — give it another try.
            </p>
            <p className="mt-3 rounded-lg bg-white/[0.06] px-3 py-2 text-left font-mono text-[11px] leading-relaxed text-white/45">
              {msg}
            </p>
            <button
              type="button"
              className="mt-6 w-full rounded-xl bg-white px-5 py-2.5 text-[14px] font-bold text-zinc-900 transition hover:bg-white/95 active:scale-[0.99]"
              onClick={this.handleRetry}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return <Fragment key={this.state.retryNonce}>{this.props.children}</Fragment>
  }
}
