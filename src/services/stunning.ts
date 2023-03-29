export const initStunning = (stripeID: string | null) => {
  if (document.getElementById('stunning-bar') || !stripeID)
    return
  const d = document
  const t = 'script'
  const e = d.createElement(t) as HTMLScriptElement
  const s = d.getElementsByTagName(t)[0]
  e.src = 'https://d1gqkepxkcxgvm.cloudfront.net/stunning-bar.js'
  e.id = 'stunning-bar'
  e.setAttribute('defer', '')
  e.setAttribute('data-app-ckey', '4384wwiyssejbkcnlrcaiwurq')
  e.setAttribute('data-stripe-id', stripeID)
  s.parentNode?.insertBefore(e, s)
}
