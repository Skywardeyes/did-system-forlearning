<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from './stores/session'
import { useWorkspaceStore } from './stores/workspace'

const route = useRoute(); const router = useRouter(); const session = useSessionStore(); const workspace = useWorkspaceStore()
const switching = ref(false)
const title = computed(() => String(route.meta.title || '信证台'))
const isPublic = computed(() => Boolean(route.meta.public))
const roles = computed(() => new Set(session.session?.roles || []))
const allNav = [
  { to: '/', icon: '总', label: '运行总览', roles: ['tenant_admin', 'issuer_operator', 'holder_operator', 'verifier_operator'] },
  { to: '/dids', icon: '身', label: 'DID 身份', roles: ['tenant_admin'] },
  { to: '/credentials', icon: '签', label: '凭证签发', roles: ['issuer_operator'] },
  { to: '/verify', icon: '验', label: '凭证验证', roles: ['verifier_operator'] },
  { to: '/wallet-verify', icon: '包', label: '钱包证明验证', roles: ['verifier_operator'] },
  { to: '/disclosure', icon: '隐', label: '选择性披露', roles: ['holder_operator'] },
  { to: '/audit', icon: '审', label: '审计中心', roles: ['tenant_admin'] },
  { to: '/organization', icon: '组', label: '组织与成员', roles: ['tenant_admin', 'workspace_owner'] },
]
const nav = computed(() => [...allNav.filter((item) => item.roles.some((role) => roles.value.has(role))),
  ...(session.platformRoles.includes('platform_admin') ? [{ to: '/platform', icon: '平', label: '平台治理后台', roles: [] }] : [])])

async function changeWorkspace(event: Event) {
  switching.value = true
  try { await session.switchWorkspace((event.target as HTMLSelectElement).value); await router.push('/'); await workspace.refresh() }
  finally { switching.value = false }
}

async function logout() { await session.logout(); await router.replace('/login') }
</script>

<template>
  <RouterView v-if="isPublic" />
  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">信</span><div><strong>信证台</strong><small>DID / VC WORKSPACE</small></div></div>
      <div class="workspace-switcher">
        <label>当前空间
          <select :value="session.session?.tenant.id" :disabled="switching" @change="changeWorkspace">
            <option v-for="item in session.workspaces" :key="item.id" :value="item.id">{{ item.type === 'personal' ? '个人｜' : '组织｜' }}{{ item.name }}</option>
          </select>
        </label>
        <small v-if="session.session?.tenant.verificationStatus === 'pending'">组织审核中：签发与验证能力尚未开放</small>
      </div>
      <nav aria-label="主导航"><RouterLink v-for="item in nav" :key="item.to" :to="item.to" class="nav-item"><span>{{ item.icon }}</span>{{ item.label }}</RouterLink></nav>
      <div class="sidebar-foot"><i></i>租户隔离已启用<br><small>私钥不进入平台数据库</small><button @click="logout">退出登录</button></div>
    </aside>
    <main>
      <header class="topbar">
        <div><p class="eyebrow">DID / VC PRODUCTION CONSOLE</p><h1>{{ title }}</h1></div>
        <div class="session-badges"><span class="safe">V2 已认证</span><span>{{ session.session?.actor.displayName || session.session?.actor.email }}</span><span>{{ session.session?.tenant.name }}</span><span>{{ session.session?.roles.join(' / ') }}</span></div>
      </header>
      <RouterView />
    </main>
  </div>
</template>
