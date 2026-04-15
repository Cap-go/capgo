export const authPrimaryButtonClass = [
  'inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-base font-semibold text-white',
  'bg-[linear-gradient(135deg,rgba(36,67,102,1)_0%,rgba(12,110,184,1)_100%)] shadow-[0_20px_38px_-26px_rgba(17,158,255,0.85)]',
  'transition duration-200 hover:-translate-y-0.5 hover:brightness-105',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--color-azure-500)]',
  'disabled:pointer-events-none disabled:opacity-60',
].join(' ')

export const authSecondaryButtonClass = [
  'inline-flex w-full items-center justify-center rounded-2xl border border-slate-400/55 bg-white/92 px-4 py-4 text-base font-semibold text-slate-700',
  'transition duration-200 hover:border-[rgba(17,158,255,0.45)] hover:bg-slate-100/95',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--color-azure-500)]',
  'dark:border-slate-600/90 dark:bg-slate-950/85 dark:text-slate-200 dark:hover:bg-slate-800/95',
  'disabled:pointer-events-none disabled:opacity-60',
].join(' ')

export const authInlineLinkClass = [
  'inline-flex items-center justify-center gap-1 border-none bg-transparent p-0 text-[0.95rem] font-semibold text-[rgb(255,114,17)]',
  'transition-colors duration-200 hover:text-[rgb(235,94,0)]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--color-azure-500)]',
].join(' ')

export const authGhostButtonClass = [
  'rounded-full px-4 py-[0.55rem] text-[0.95rem] font-medium text-slate-500 transition-colors duration-200',
  'hover:bg-slate-200/75 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/85 dark:hover:text-white',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--color-azure-500)]',
].join(' ')

export const authPanelClass = 'rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 text-center dark:border-slate-700 dark:bg-slate-900/70'

export const authInsetCardClass = 'rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.45)] dark:border-slate-700/80 dark:bg-slate-950/55'
