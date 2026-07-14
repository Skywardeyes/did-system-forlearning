import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import DidView from '../views/DidView.vue'
import CredentialView from '../views/CredentialView.vue'
import VerifyView from '../views/VerifyView.vue'
import DisclosureView from '../views/DisclosureView.vue'
import AuditView from '../views/AuditView.vue'
import WalletVerifyView from '../views/WalletVerifyView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView, meta: { title: '运行总览' } },
    { path: '/dids', name: 'dids', component: DidView, meta: { title: 'DID 身份' } },
    { path: '/credentials', name: 'credentials', component: CredentialView, meta: { title: '凭证签发' } },
    { path: '/verify', name: 'verify', component: VerifyView, meta: { title: '凭证验证' } },
    { path: '/disclosure', name: 'disclosure', component: DisclosureView, meta: { title: '选择性披露' } },
    { path: '/audit', name: 'audit', component: AuditView, meta: { title: '审计中心' } },
    { path: '/wallet-verify', name: 'wallet-verify', component: WalletVerifyView, meta: { title: '钱包证明验证' } },
  ],
})
