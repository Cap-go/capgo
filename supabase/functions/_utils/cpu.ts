import { getEnv } from './utils.ts'

const supaUrl = 'https://xvwzpoazmxkqosrdewyv.supabase.co'
const supaServ = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2d3pwb2F6bXhrcW9zcmRld3l2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY5MjgyMTE5NywiZXhwIjoyMDA4Mzk3MTk3fQ.xSck0RlXrdDKFnEdlK2eseMuyTdvLDO3V3EtGLQKoNY'

function getMetrics(name: string): Promise<string[]> {
  const auth = btoa(`service_role:${getEnv('SUPABASE_SERVICE_ROLE_KEY' || supaServ)}`)
  return fetch(`${getEnv('SUPABASE_URL') || supaUrl}/customer/v1/privileged/metrics`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  })
    .then(response => response.text())
    .then((data) => {
      const lines = data.split('\n')
      return lines.filter(line => line.includes(name) && !line.startsWith('#')) as string[]
    })
    .catch((err) => {
      console.error(err)
      return [] as string[]
    })
}

export function getCpu() {
  return getMetrics('node_cpu_seconds_total')
    .then((lines) => {
      const cores: { [key: string]: { idle: number; total: number } } = {}
      console.log(lines)
      lines.forEach((line) => {
        console.log(line)
        const parts = line.split(' ')
        const value = Number.parseFloat(parts[1])
        const cpuMatch = line.match(/cpu="(\d+)"/)
        if (cpuMatch) {
          const cpu = cpuMatch[1]
          if (!cores[cpu])
            cores[cpu] = { idle: 0, total: 0 }

          if (line.includes('mode="idle"'))
            cores[cpu].idle += value

          cores[cpu].total += value
        }
      })
      let totalPercentage = 0
      let coreCount = 0
      for (const cpu in cores) {
        const percentage = ((cores[cpu].total - cores[cpu].idle) / cores[cpu].total) * 100
        totalPercentage += percentage
        coreCount++
      }
      const avgCpuPercentage = totalPercentage / coreCount
      const cpuUsageRound = Math.round(avgCpuPercentage * 100) / 100
      console.log('Average CPU %: ', cpuUsageRound)
      return cpuUsageRound
    })
}

export function getMem() {
  return getMetrics('node_memory_MemFree_bytes')
    .then((lines) => {
      console.log(lines)
      const total = lines.reduce((acc, line) => {
        const parts = line.split(' ')
        const value = Number.parseFloat(parts[1])
        return acc + value
      }, 0)
      const totalGb = total / 1024 / 1024 / 1024
      const totalGbRound = Math.round(totalGb * 100) / 100
      console.log('Total memory GB: ', totalGbRound)
      return totalGbRound
    })
}

// getMem()
// getCpu()
