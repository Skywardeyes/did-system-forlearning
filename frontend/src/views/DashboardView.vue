<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceStore } from '../stores/workspace'
const workspace = useWorkspaceStore()
const active = computed(() => workspace.activeCredentials.length)
</script>

<template>
  <div class="view">
    <section class="stats-grid">
      <article><span>DID 身份</span><strong>{{ workspace.dids.length }}</strong><small>Issuer 与 Holder 公共身份</small></article>
      <article><span>VC 摘要</span><strong>{{ workspace.credentials.length }}</strong><small>列表不返回个人声明</small></article>
      <article><span>有效凭证</span><strong>{{ active }}</strong><small>状态为 active</small></article>
      <article><span>验证记录</span><strong>{{ workspace.verificationLogs.length }}</strong><small>只追加证据链</small></article>
    </section>
    <div class="dashboard-grid">
      <section class="panel">
        <header class="panel-head"><div><p>TRUST FLOW</p><h2>可验证凭证安全闭环</h2></div></header>
        <div class="trust-flow">
          <div><b>01</b><strong>DID</strong><small>解析公钥与验证方法</small></div>
          <div><b>02</b><strong>Sign</strong><small>Issuer 通过 KMS 签名</small></div>
          <div><b>03</b><strong>Protect</strong><small>VC 正文加密存储</small></div>
          <div><b>04</b><strong>Verify</strong><small>按需披露并记录证据</small></div>
        </div>
      </section>
      <section class="panel security-card">
        <header class="panel-head"><div><p>SECURITY POSTURE</p><h2>当前安全边界</h2></div></header>
        <ul><li>AES-256-GCM 静态加密</li><li>Ed25519 签名验签</li><li>VC 列表默认不解密</li><li>敏感访问强制用途与审计</li></ul>
      </section>
    </div>
  </div>
</template>
