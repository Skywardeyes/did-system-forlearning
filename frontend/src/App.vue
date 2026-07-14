<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useSessionStore } from './stores/session'
import { useWorkspaceStore } from './stores/workspace'

const route = useRoute()
const session = useSessionStore()
const workspace = useWorkspaceStore()
const startupError = ref('')
const title = computed(() => String(route.meta.title || '信证台'))
const nav = [
  ['/', '总', '运行总览'], ['/dids', '身', 'DID 身份'], ['/credentials', '签', '凭证签发'],
  ['/verify', '验', '凭证验证'], ['/wallet-verify', '包', '钱包验证'], ['/disclosure', '隐', '选择性披露'], ['/audit', '志', '审计中心'],
]

onMounted(async () => {
  try { await session.initializeLocalDemo(); await workspace.refresh() }
  catch (error) { startupError.value = error instanceof Error ? error.message : '启动失败' }
})
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">信</span><div><strong>信证台</strong><small>VUE 3 / V2 CONSOLE</small></div></div>
      <nav aria-label="主导航">
        <RouterLink v-for="item in nav" :key="item[0]" :to="item[0]" class="nav-item">
          <span>{{ item[1] }}</span>{{ item[2] }}
        </RouterLink>
      </nav>
      <div class="sidebar-foot"><i></i>安全数据模式<br><small>VC 默认不解密</small></div>
    </aside>
    <main>
      <header class="topbar">
        <div><p class="eyebrow">DID / VC PRODUCTION CONSOLE</p><h1>{{ title }}</h1></div>
        <div class="session-badges">
          <span v-if="session.authenticated" class="safe">V2 已认证</span>
          <span>{{ session.session?.tenant.name || '建立会话中' }}</span>
          <span>{{ session.session?.roles.join(' / ') || '—' }}</span>
        </div>
      </header>
      <div v-if="startupError" class="startup-error"><strong>无法建立安全会话</strong><p>{{ startupError }}</p></div>
      <RouterView v-else />
    </main>
  </div>
</template>
