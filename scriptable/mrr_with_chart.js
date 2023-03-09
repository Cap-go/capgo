const API_TOKEN = '***'
const API_SECRET = '***'
// try with https://observablehq.com/d/1812d1d95464159c to debug
class LineChart {
  // LineChart by https://kevinkub.de/

  constructor(width, height, values) {
    this.ctx = new DrawContext()
    this.ctx.size = new Size(width, height)
    this.values = values
  }

  _calculatePath() {
    const maxValue = Math.max(...this.values)
    const minValue = Math.min(...this.values)
    const difference = maxValue - minValue
    const count = this.values.length
    const step = this.ctx.size.width / (count - 1)
    const points = this.values.map((current, index, all) => {
      const x = step * index
      const y = this.ctx.size.height - (current - minValue) / difference * this.ctx.size.height
      return new Point(x, y)
    })
    return this._getSmoothPath(points)
  }

  _getSmoothPath(points) {
    const path = new Path()
    path.move(new Point(0, this.ctx.size.height))
    path.addLine(points[0])
    for (let i = 0; i < points.length - 1; i++) {
      const xAvg = (points[i].x + points[i + 1].x) / 2
      const yAvg = (points[i].y + points[i + 1].y) / 2
      const avg = new Point(xAvg, yAvg)
      const cp1 = new Point((xAvg + points[i].x) / 2, points[i].y)
      const next = new Point(points[i + 1].x, points[i + 1].y)
      const cp2 = new Point((xAvg + points[i + 1].x) / 2, points[i + 1].y)
      path.addQuadCurve(avg, cp1)
      path.addQuadCurve(next, cp2)
    }
    path.addLine(new Point(this.ctx.size.width, this.ctx.size.height))
    path.closeSubpath()
    return path
  }

  configure(fn) {
    const path = this._calculatePath()
    if (fn) {
      fn(this.ctx, path)
    }
    else {
      this.ctx.addPath(path)
      this.ctx.fillPath(path)
    }
    return this.ctx
  }
}

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
const data = []
for (const val of jsonTotal.entries) {
  const date = new Date(val.date)

  if (date <= today)
    data.push(val.mrr)
}
const chart = new LineChart(400, 400, data).configure((ctx, path) => {
  ctx.opaque = false
  ctx.setFillColor(new Color('8cc5ff', 0.5))
  ctx.addPath(path)
  ctx.fillPath(path)
}).getImage()

// Create the widget
const w = new ListWidget()
w.backgroundImage = chart
createProject(w, 'Total MRR', jsonTotal.summary.current, 16, jsonTotal.summary['percentage-change'])
w.addSpacer(4)

createProject(w, 'Capgo MRR', jsonCapgo.summary.current, 12, jsonCapgo.summary['percentage-change'])
createProject(w, 'Captime MRR', jsonCaptime.summary.current, 12, jsonCaptime.summary['percentage-change'])

Script.setWidget(w)
Script.complete()
