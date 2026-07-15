import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CredentialTable from './CredentialTable.vue'

describe('CredentialTable', () => {
  it('renders a readable issuance log without rendering credential claims', () => {
    const wrapper = mount(CredentialTable, { props: { records: [{
      id: 'urn:uuid:credential-1', status: 'active', issuerDidId: 'issuer-1', holderDidId: 'holder-1',
      issuedAt: '2026-07-14T00:00:00.000Z', validFrom: '2026-07-14T00:00:00.000Z',
      validUntil: '2027-07-14T00:00:00.000Z', rowVersion: 1, contentProtected: true,
      selectiveDisclosureAvailable: true, sdJwtAvailable: true,
      templateName: '大学毕业证明', templateVersion: 2, credentialType: 'UniversityDegreeCredential',
      issuerName: '上海大学', issuerDid: 'did:example:university', holderName: '张同学', holderDid: 'did:key:zholder',
    }] } })
    expect(wrapper.text()).toContain('大学毕业证明 · V2')
    expect(wrapper.text()).toContain('上海大学 签发')
    expect(wrapper.text()).toContain('张同学')
    expect(wrapper.text()).toContain('凭证编号')
    expect(wrapper.text()).not.toContain('学员姓名')
    expect(wrapper.text()).not.toContain('credentialSubject')
  })
})
