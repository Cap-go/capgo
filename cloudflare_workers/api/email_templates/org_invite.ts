import existingHtml from './org_invite_existing.html'
import existingText from './org_invite_existing.txt'
import newHtml from './org_invite_new.html'
import newText from './org_invite_new.txt'
import { renderEmailTemplate } from './render.ts'

export function renderOrgInvitationEmail(isNewUser: boolean, details: Record<string, string>) {
  return renderEmailTemplate(isNewUser
    ? { subject: '[Capgo]: Join {{ org_name }} org & create account', html: newHtml, text: newText }
    : { subject: '[Capgo]: Join {{ org_name }} with your account', html: existingHtml, text: existingText }, details, ['invited_first_name', 'invited_last_name'])
}
