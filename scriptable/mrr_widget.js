const API_TOKEN = '***'
const API_SECRET = '***'

// Recreating a basic auth with Scriptable lib
const auth = `Basic ${btoa(`${API_TOKEN}:${API_SECRET}`)}`
const currentYear = new Date().getFullYear()
const startDate = `${currentYear}-01-01`
const endDate = `${currentYear}-12-31`
const endpointTotal = `https://api.chartmogul.com/v1/metrics/mrr?start-date=${startDate}&end-date=${endDate}`
const endpointCapgo = `${endpointTotal}&plans=Solo,Team,Pay%20as%20you%20go,Maker`
const endpointCaptime = `${endpointTotal}&plans=Captime%20PRO,Captime%20PRO%20Monthly,Captime%20PRO%20yearly%20deal,ee.forgr.captime.pro2,ee.forgr.captime.pro_deal,ee.forgr.captime.pro_monthly`
// the only way to filter is using the plan name, you can find them here : https://app.chartmogul.com/#/admin/plans

async function loadItems(at) {
  const req = new Request(at)
  req.headers = { Authorization: auth }
  const response = await req.loadJSON()
  return response
}
function createProject(wid, title, val, s, c) {
  const t1 = wid.addText(title)
  const hstack = wid.addStack()
  hstack.layoutHorizontally()
  hstack.spacing = 2

  t1.textColor = Color.white()
  t1.font = new Font('Avenir-Heavy', s)
  const formatedNumber = new Intl.NumberFormat('en-US').format(Math.floor(val / 100).toString())
  const change = c > 0 ? `+ ${c}%` : `- ${Math.abs(c)}%`
  const t2 = hstack.addText(`€${formatedNumber}`)
  const t3 = hstack.addText(`${change}`)
  t2.textColor = Color.white()
  t3.textColor = c > 0 ? new Color('#32CD32') : new Color('#FF0000')
  t2.font = new Font('Avenir-Heavy', s + 4)
  t3.font = new Font('Avenir-Heavy', s - 2)
}
// Request the MRR data
const jsonTotal = await loadItems(endpointTotal)
const jsonCapgo = await loadItems(endpointCapgo)
const jsonCaptime = await loadItems(endpointCaptime)

const today = new Date()
today.setHours(23, 59, 0, 0)
console.log(jsonTotal)
const data = []
for (const val of jsonTotal.entries) {
  const date = new Date(val.date)

  if (date <= today)
    data.push(val.mrr)
}

// Create the widget
const w = new ListWidget()
w.backgroundColor = new Color('#1d44b8')
createProject(w, 'Total MRR', jsonTotal.summary.current, 16, jsonTotal.summary['percentage-change'])
w.addSpacer(4)

createProject(w, 'Capgo MRR', jsonCapgo.summary.current, 12, jsonCapgo.summary['percentage-change'])
createProject(w, 'Captime MRR', jsonCaptime.summary.current, 12, jsonCaptime.summary['percentage-change'])

Script.setWidget(w)
Script.complete()
