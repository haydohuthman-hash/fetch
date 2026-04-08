import { Route, Routes } from 'react-router-dom'
import { AdminLayout } from './AdminLayout'
import { AdminDashboardPage } from './AdminDashboardPage'
import { AdminProductsPage } from './AdminProductsPage'
import { AdminCategoriesPage } from './AdminCategoriesPage'
import { AdminAssistantPage } from './AdminAssistantPage'
import { AdminPlaceholderPage } from './AdminPlaceholderPage'

export function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="products" element={<AdminProductsPage />} />
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="assistant" element={<AdminAssistantPage />} />
        <Route path="orders" element={<AdminPlaceholderPage />} />
        <Route path="settings" element={<AdminPlaceholderPage />} />
      </Route>
    </Routes>
  )
}
