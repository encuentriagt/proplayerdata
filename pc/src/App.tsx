import { Route, Routes } from 'react-router-dom'
import { OrgLayout, RequireAdminArea } from './components/OrgLayout'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { AcceptInvitation } from './pages/AcceptInvitation'
import { ChangePassword } from './pages/ChangePassword'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { Home } from './pages/Home'
import { Calendar } from './pages/Calendar'
import { EventList } from './pages/EventList'
import { EventFormPage } from './pages/EventForm'
import { EventDetailPage } from './pages/EventDetail'
import { Teams } from './pages/Teams'
import { TeamDetailPage } from './pages/TeamDetail'
import { Players } from './pages/Players'
import { PlayerDetailPage } from './pages/PlayerDetail'
import { AdminIndex, AdminLayout, RequirePermission } from './pages/admin/AdminLayout'
import { useOrg } from './lib/org'
import { AdminMembers } from './pages/admin/Members'
import { AdminTeams } from './pages/admin/Teams'
import { AdminSeasons } from './pages/admin/Seasons'
import { AdminPlans } from './pages/admin/Plans'
import { AdminBranding } from './pages/admin/Branding'
import { AdminInvitations } from './pages/admin/Invitations'
import { AdminSports } from './pages/admin/Sports'
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
        <Route path="partidos" element={<EventList key="match" type="match" />} />
        <Route path="entrenos" element={<EventList key="training" type="training" />} />
        <Route path="eventos/nuevo" element={<EventFormPage />} />
        <Route path="eventos/:id" element={<EventDetailPage />} />
        <Route path="eventos/:id/editar" element={<EventFormPage />} />
        <Route path="equipos" element={<Teams />} />
        <Route path="equipos/:id" element={<TeamDetailPage />} />
        <Route path="jugadores" element={<Players />} />
        <Route path="jugadores/:id" element={<PlayerDetailPage />} />
        <Route path="admin" element={<RequireAdminArea><AdminLayout /></RequireAdminArea>}>
          <Route index element={<AdminIndex />} />
          <Route path="miembros" element={<Guard k="manage_members"><AdminMembers /></Guard>} />
          <Route path="deportes" element={<Guard k="manage_sports"><AdminSports /></Guard>} />
          <Route path="equipos" element={<AdminTeams />} />
          <Route path="temporadas" element={<Guard k="manage_seasons"><AdminSeasons /></Guard>} />
          <Route path="planes" element={<Guard k="manage_plans"><AdminPlans /></Guard>} />
          <Route path="marca" element={<Guard k="manage_branding"><AdminBranding /></Guard>} />
          <Route path="invitaciones" element={<Guard k="manage_members"><AdminInvitations /></Guard>} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

type BoolPerm = 'manage_members' | 'manage_seasons' | 'manage_plans' | 'manage_branding' | 'manage_sports'
function Guard({ k, children }: { k: BoolPerm; children: React.ReactNode }) {
  const { can } = useOrg()
  return <RequirePermission allowed={can[k]}>{children}</RequirePermission>
}
