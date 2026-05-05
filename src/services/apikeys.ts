import type { SupabaseClient } from '@supabase/supabase-js'
import type { TableColumn } from '~/components/comp_def'
import type { DialogV2Button, DialogV2Options } from '~/stores/dialogv2'
import type { Database } from '~/types/supabase.types'

export async function createDefaultApiKey(
  supabase: SupabaseClient<Database>,
  name: string,
) {
  return supabase.functions.invoke('apikey', {
    method: 'POST',
    body: {
      name,
      mode: 'all',
    },
  })
}

interface ApiKeyListRow {
  name?: string | null
  mode: string | null
  created_at: string | null
}

interface DialogStoreLike {
  lastButtonRole?: string
  openDialog: (options: DialogV2Options) => void
  onDialogDismiss: () => Promise<boolean>
}

type Translate = (key: string) => string

function createDialogButton(
  text: string,
  role: DialogV2Button['role'],
  handler?: DialogV2Button['handler'],
): DialogV2Button {
  return {
    text,
    role,
    handler,
  }
}

export function isApiKeyExpired(expiresAt: string | null): boolean {
  if (!expiresAt)
    return false

  return new Date(expiresAt) < new Date()
}

export function formatApiKeyScope(
  items: string[] | null | undefined,
  formatItem: (item: string) => string,
  emptyValue = '',
): string {
  if (!items || items.length === 0)
    return emptyValue

  return items.map(formatItem).join(', ')
}

export function sortApiKeyRows<T extends ApiKeyListRow>(
  rows: T[],
  columns: TableColumn[],
): T[] {
  let result = [...rows]

  columns.forEach((col) => {
    if (!col.sortable || typeof col.sortable !== 'string')
      return

    result = [...result].sort((a, b) => {
      let aValue: string | number = ''
      let bValue: string | number = ''

      switch (col.key) {
        case 'name':
          aValue = a.name?.toLowerCase() || ''
          bValue = b.name?.toLowerCase() || ''
          break
        case 'mode':
          aValue = (a.mode ?? '').toLowerCase()
          bValue = (b.mode ?? '').toLowerCase()
          break
        case 'created_at':
          aValue = a.created_at ? new Date(a.created_at).getTime() : 0
          bValue = b.created_at ? new Date(b.created_at).getTime() : 0
          break
        default:
          return 0
      }

      if (aValue < bValue)
        return col.sortable === 'asc' ? -1 : 1
      if (aValue > bValue)
        return col.sortable === 'asc' ? 1 : -1
      return 0
    })
  })

  return result
}

export async function confirmApiKeyDeletion(
  dialogStore: DialogStoreLike,
  t: Translate,
): Promise<boolean> {
  dialogStore.openDialog({
    title: t('alert-confirm-delete'),
    description: `${t('alert-not-reverse-message')} ${t('alert-delete-message')}?`,
    buttons: [
      createDialogButton(t('button-cancel'), 'cancel'),
      createDialogButton(t('button-delete'), 'danger'),
    ],
  })

  const wasCanceled = await dialogStore.onDialogDismiss()
  return !wasCanceled && dialogStore.lastButtonRole === 'danger'
}

export async function confirmApiKeyRegeneration(
  dialogStore: DialogStoreLike,
  t: Translate,
): Promise<boolean> {
  dialogStore.openDialog({
    title: t('alert-confirm-regenerate'),
    description: `${t('alert-not-reverse-message')}. ${t('alert-regenerate-key')}?`,
    buttons: [
      createDialogButton(t('button-cancel'), 'cancel'),
      createDialogButton(t('button-regenerate'), 'primary'),
    ],
  })

  const wasCanceled = await dialogStore.onDialogDismiss()
  return !wasCanceled && dialogStore.lastButtonRole === 'primary'
}

export async function showApiKeySecretModal(
  dialogStore: DialogStoreLike,
  t: Translate,
  plainKey: string,
  onCopySuccess?: () => void,
): Promise<void> {
  dialogStore.openDialog({
    title: t('secure-key-created'),
    description: `${t('secure-key-warning')}\n\n${t('your-api-key')}: ${plainKey}`,
    size: 'lg',
    buttons: [
      createDialogButton(t('copy-and-close'), 'primary', async () => {
        try {
          await navigator.clipboard.writeText(plainKey)
          onCopySuccess?.()
        }
        catch {}
      }),
    ],
  })

  await dialogStore.onDialogDismiss()
}
