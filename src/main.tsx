import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'mapbox-gl/dist/mapbox-gl.css'
import './index.css'
import './fetch-theme.css'
import { FetchThemeProvider } from './theme/FetchThemeContext'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FetchThemeProvider>
      <App />
    </FetchThemeProvider>
  </StrictMode>,
)
