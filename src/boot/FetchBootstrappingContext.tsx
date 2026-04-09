import { createContext, useContext, type ReactNode } from 'react'

/** True while the post-splash bootstrap overlay covers home (map + sheet skeleton). */
const FetchBootstrappingContext = createContext(false)

export function FetchBootstrappingProvider({
  value,
  children,
}: {
  value: boolean
  children: ReactNode
}) {
  return (
    <FetchBootstrappingContext.Provider value={value}>
      {children}
    </FetchBootstrappingContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with provider
export function useFetchBootstrapping() {
  return useContext(FetchBootstrappingContext)
}
