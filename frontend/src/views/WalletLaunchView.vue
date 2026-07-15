<script setup lang="ts">
const walletUrl = String(import.meta.env.VITE_WALLET_URL || 'http://127.0.0.1:5176')
</script>

<template>
  <div class="view">
    <section class="panel wallet-launch-panel">
      <header class="panel-head"><div><p>HOLDER SELF-CUSTODY</p><h2>前往信证钱包</h2></div><span>私钥不进入信证台</span></header>
      <p>个人空间只管理账号、组织关系和公开 Holder DID。凭证领取、本地保管、字段选择与 Holder 签名统一在个人钱包完成。</p>
      <div class="security-note">打开钱包后，信证台不会读取你的 Holder 私钥、完整本地凭证或未披露字段。</div>
      <div class="actions"><a class="button-link primary" :href="walletUrl" target="_blank" rel="noopener noreferrer">打开个人钱包</a></div>
      <small>钱包地址：{{ walletUrl }}</small>
    </section>
  </div>
</template>
