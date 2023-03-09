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

// Load MRR
// https://gist.github.com/daolf/ae104b1ab7cabf564b47770c88d4214b

const API_TOKEN = 'PROFITWELL_API_TOKEN'

// Recreating a basic auth with Scriptable lib
const currentYear = new Date().getFullYear()
const tempMonth = new Date().getMonth() + 1
const currentDate = new Date().getDate()
const currentMonth = (tempMonth < 10 ? `0${tempMonth}` : tempMonth)
const date = `${currentYear}-${currentMonth}`
const endpoint = `https://api.profitwell.com/v2/metrics/daily/?metrics=recurring_revenue,active_customers&month=${date}`

async function loadItems() {
  const at = endpoint
  const req = new Request(at)
  req.headers = { Authorization: API_TOKEN }
  const response = await req.loadJSON()
  return response
}

function kFormatter(num) {
  return Math.abs(num) > 999 ? `${Math.sign(num) * ((Math.abs(num) / 1000).toFixed(1))}k` : Math.sign(num) * Math.abs(num)
}

const json = await loadItems()
let MRR = json.data.recurring_revenue[json.data.recurring_revenue.length - 1].value
const ARR = kFormatter(MRR * 12)

const absoluteChange = Math.floor(MRR - json.data.recurring_revenue[0].value).toString()
const percentChange = (absoluteChange * 100 / MRR).toFixed(1).toString()

const dailyAbsoluteChange = currentDate >= 2 ? Math.floor(MRR - json.data.recurring_revenue[currentDate - 2].value).toString() : null
MRR = Math.floor(MRR)

const nbActiveCustomers = json.data.active_customers[currentDate - 1].value

const today = new Date()
today.setHours(23, 59, 0, 0)
const data = []
for (const val of json.data.recurring_revenue) {
  const date = new Date(val.date)

  if (date <= today)
    data.push(val.value)
}

const widget = new ListWidget()
const chart = new LineChart(400, 400, data).configure((ctx, path) => {
  ctx.opaque = false
  ctx.setFillColor(new Color('8cc5ff', 0.5))
  ctx.addPath(path)
  ctx.fillPath(path)
}).getImage()
widget.addText(`MRR $${MRR.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`)
widget.addText(`ARR $${ARR.toString()}`)

// display (% change)
widget.addSpacer(10)
if (absoluteChange >= 0) {
  const changeText = widget.addText(`+$${absoluteChange.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} (${percentChange}%) this month`)
  changeText.textColor = Color.green()
  changeText.font = Font.semiboldSystemFont(10)
}
else {
  const changeText = widget.addText(`$${Math.abs(absoluteChange).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} (-${percentChange}%) this month`)
  changeText.textColor = Color.red()
  changeText.font = Font.semiboldSystemFont(10)
}

// Daily change
widget.addSpacer(4)
if (dailyAbsoluteChange !== null) {
  if (dailyAbsoluteChange >= 0) {
	  const dailyChangeText = widget.addText(`+$${dailyAbsoluteChange.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} today`)
	  if (dailyAbsoluteChange > 0)
		  dailyChangeText.textColor = Color.green()

	  dailyChangeText.font = Font.semiboldSystemFont(10)
  }
  else {
	  const dailyChangeText = widget.addText(`-$${Math.abs(dailyAbsoluteChange).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} today`)
	  dailyChangeText.textColor = Color.red()
	  dailyChangeText.font = Font.semiboldSystemFont(10)
  }
}

widget.addSpacer(4)
const activeCustomerText = widget.addText(`${nbActiveCustomers} customers`)
activeCustomerText.font = Font.semiboldSystemFont(10)
activeCustomerText.textColor = Color.white()

widget.addSpacer()
widget.backgroundImage = chart

Script.setWidget(widget)
if (!config.runsInWidget)
  await widget.presentSmall()

Script.complete()
