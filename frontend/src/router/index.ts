import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '../stores/session'
import LoginView from '../views/LoginView.vue'
import DashboardView from '../views/DashboardView.vue'
import DidView from '../views/DidView.vue'
import CredentialView from '../views/CredentialView.vue'
import VerifyView from '../views/VerifyView.vue'
import DisclosureView from '../views/DisclosureView.vue'
import AuditView from '../views/AuditView.vue'
import WalletVerifyView from '../views/WalletVerifyView.vue'
import OrganizationView from '../views/OrganizationView.vue'
import PlatformAdminView from '../views/PlatformAdminView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { title: '登录或注册', public: true } },
    { path: '/', name: 'dashboard', component: DashboardView, meta: { title: '运行总览' } },
    { path: '/dids', name: 'dids', component: DidView, meta: { title: 'DID 身份', roles: ['tenant_admin'] } },
    { path: '/credentials', name: 'credentials', component: CredentialView, meta: { title: '凭证签发', roles: ['issuer_operator'] } },
    { path: '/verify', name: 'verify', component: VerifyView, meta: { title: '凭证验证', roles: ['verifier_operator'] } },
    { path: '/disclosure', name: 'disclosure', component: DisclosureView, meta: { title: '选择性披露', roles: ['holder_operator'] } },
    { path: '/audit', name: 'audit', component: AuditView, meta: { title: '审计中心', roles: ['tenant_admin'] } },
    { path: '/wallet-verify', name: 'wallet-verify', component: WalletVerifyView, meta: { title: '钱包证明验证', roles: ['verifier_operator'] } },
    { path: '/organization', name: 'organization', component: OrganizationView, meta: { title: '组织与成员', roles: ['tenant_admin', 'workspace_owner'] } },
    { path: '/platform', name: 'platform', component: PlatformAdminView, meta: { title: '平台治理后台', platformRole: 'platform_admin' } },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  await session.initialize()
  if (!to.meta.public && !session.authenticated) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.name === 'login' && session.authenticated) return { name: 'dashboard' }
  const requiredRoles = Array.isArray(to.meta.roles) ? to.meta.roles.map(String) : []
  if (requiredRoles.length && !requiredRoles.some((role) => session.session?.roles.includes(role))) return { name: 'dashboard' }
  if (to.meta.platformRole && !session.platformRoles.includes(String(to.meta.platformRole))) return { name: 'dashboard' }
})

export default router
