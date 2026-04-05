type FetchSplashEyesProps = {
  /** `blinking` = cold-open sequence; `awake` = widened eyes (splash handoff / bootstrap). */
  mode: 'blinking' | 'awake'
  className?: string
}

export function FetchSplashEyes({ mode, className = '' }: FetchSplashEyesProps) {
  return (
    <div
      className={[
        'fetch-splash-eyes relative flex items-center justify-center gap-[clamp(1.75rem,8vw,2.75rem)]',
        mode === 'blinking' ? 'fetch-splash-eyes--blinking' : '',
        mode === 'awake' ? 'fetch-splash-eyes--awake' : '',
        className,
      ].join(' ')}
      aria-hidden
    >
      <div className="fetch-splash-eye">
        <span className="fetch-splash-eye__glow" />
        <span className="fetch-splash-eye__ball" />
      </div>
      <div className="fetch-splash-eye">
        <span className="fetch-splash-eye__glow" />
        <span className="fetch-splash-eye__ball" />
      </div>
    </div>
  )
}
