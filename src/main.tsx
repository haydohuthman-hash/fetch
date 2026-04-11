import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import 'mapbox-gl/dist/mapbox-gl.css'
import './index.css'
import './fetch-theme.css'
import { FetchAccentProvider } from './theme/FetchAccentContext'
import { FetchThemeProvider } from './theme/FetchThemeContext'
import App from './App.tsx'
import { AdminApp } from './admin/AdminApp'
import { FetchAnalyticsPing } from './components/FetchAnalyticsPing'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FetchThemeProvider>
      <FetchAccentProvider>
        <BrowserRouter>
          <FetchAnalyticsPing />
          <Routes>
            <Route path="/admin/*" element={<AdminApp />} />
            <Route path="*" element={<App />} />
          </Routes>
        </BrowserRouter>
      </FetchAccentProvider>
    </FetchThemeProvider>
  </StrictMode>,
)
