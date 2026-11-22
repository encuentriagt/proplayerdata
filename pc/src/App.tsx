import { Navigate, Route, Routes } from 'react-router-dom'
import { OrgLayout, RequireAdmin } from './components/OrgLayout'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { AcceptInvitation } from './pages/AcceptInvitation'
import { ChangePassword } from './pages/ChangePassword'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { Home } from './pages/Home'
import { Calendar } from './pages/Calendar'
import { EventFormPage } from './pages/EventForm'
import { EventDetailPage } from './pages/EventDetail'
import { Teams } from './pages/Teams'
import { TeamDetailPage } from './pages/TeamDetail'
import { Players } from './pages/Players'
import { PlayerDetailPage } from './pages/PlayerDetail'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminMembers } from './pages/admin/Members'
import { AdminTeams } from './pages/admin/Teams'
import { AdminSeasons } from './pages/admin/Seasons'
import { AdminPlans } from './pages/admin/Plans'
import { AdminBranding } from './pages/admin/Branding'
import { AdminInvitations } from './pages/admin/Invitations'
import { NotFound } from './pages/NotFound'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/:slug/login" element={<Login />} />
      <Route path="/:slug/invitacion" element={<AcceptInvitation />} />
      <Route path="/:slug/cambiar-contrasena" element={<ChangePassword />} />
      <Route path="/:slug/olvide-contrasena" element={<ForgotPassword />} />
      <Route path="/:slug/restablecer" element={<ResetPassword />} />
      <Route path="/:slug" element={<OrgLayout />}>
        <Route index element={<Home />} />
        <Route path="calendario" element={<Calendar />} />
        <Route path="eventos/nuevo" element={<EventFormPage />} />
        <Route path="eventos/:id" element={<EventDetailPage />} />
        <Route path="eventos/:id/editar" element={<EventFormPage />} />
        <Route path="equipos" element={<Teams />} />
        <Route path="equipos/:id" element={<TeamDetailPage />} />
        <Route path="jugadores" element={<Players />} />
        <Route path="jugadores/:id" element={<PlayerDetailPage />} />
        <Route path="admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<Navigate to="miembros" replace />} />
          <Route path="miembros" element={<AdminMembers />} />
          <Route path="equipos" element={<AdminTeams />} />
          <Route path="temporadas" element={<AdminSeasons />} />
          <Route path="planes" element={<AdminPlans />} />
          <Route path="marca" element={<AdminBranding />} />
          <Route path="invitaciones" element={<AdminInvitations />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
