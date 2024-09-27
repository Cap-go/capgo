import type { Context } from '@hono/hono'
import { getEnv } from './utils.ts'

function getAllMetrics(c: Context): Promise<string[]> {
  const auth = btoa(`service_role:${getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY')}`)
  return fetch(`${getEnv(c, 'SUPABASE_URL')}/customer/v1/privileged/metrics`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  })
    .then(response => response.text())
    .then(data => data.split('\n'))
    .catch((err) => {
      console.error({ requestId: c.get('requestId'), context: 'getAllMetrics', error: err })
      return [] as string[]
    })
}

function getOneMetrics(name: string, lines: string[]): string[] {
  return lines.filter(line => line.includes(name) && !line.startsWith('#')) as string[]
}

interface CpuInfo {
  idle: number
  iowait: number
  irq: number
  nice: number
  softirq: number
  steal: number
  system: number
  user: number
}

function newCore() {
  return {
    idle: 0,
    iowait: 0,
    irq: 0,
    nice: 0,
    softirq: 0,
    steal: 0,
    system: 0,
    user: 0,
  }
}
// lines
// node_cpu_seconds_total{supabase_project_ref="db.xvwzpoazmxkqosrdewyv.supabase.co",service_type="db",cpu="0",mode="idle"} 7916.94
// node_cpu_seconds_total{supabase_project_ref="db.xvwzpoazmxkqosrdewyv.supabase.co",service_type="db",cpu="0",mode="iowait"} 519.04
// node_cpu_seconds_total{supabase_project_ref="db.xvwzpoazmxkqosrdewyv.supabase.co",service_type="db",cpu="0",mode="irq"} 0
// node_cpu_seconds_total{supabase_project_ref="db.xvwzpoazmxkqosrdewyv.supabase.co",service_type="db",cpu="0",mode="nice"} 0
// node_cpu_seconds_total{supabase_project_ref="db.xvwzpoazmxkqosrdewyv.supabase.co",service_type="db",cpu="0",mode="softirq"} 57.68
// node_cpu_seconds_total{supabase_project_ref="db.xvwzpoazmxkqosrdewyv.supabase.co",service_type="db",cpu="0",mode="steal"} 0
// node_cpu_seconds_total{supabase_project_ref="db.xvwzpoazmxkqosrdewyv.supabase.co",service_type="db",cpu="0",mode="system"} 166.3
// node_cpu_seconds_total{supabase_project_ref="db.xvwzpoazmxkqosrdewyv.supabase.co",service_type="db",cpu="0",mode="user"} 728.28
// node_cpu_seconds_total{supabase_project_ref="db.xvwzpoazmxkqosrdewyv.supabase.co",service_type="db",cpu="1",mode="idle"} 8226.95

function getPartCpuInfo(parts: string[], name: string) {
  const part = parts.find(part => part.startsWith(name))
  if (!part)
    return null
  return part.split('=')[1].replace(/"/g, '')
}
function getCpuInfo(lines: string[]) {
  const cores: Record<string, CpuInfo> = {}
  lines.forEach((line) => {
    // get all between { and }
    const parts = line.split('{')[1].split('}')[0].split(',')
    const cpuPart = getPartCpuInfo(parts, 'cpu=')
    if (cpuPart === null)
      return
    const cpu = Number.parseFloat(cpuPart)
    const mode = getPartCpuInfo(parts, 'mode=') as keyof CpuInfo
    if (!mode)
      return
    const value = Number.parseFloat(line.split(' ')[1])
    if (!cores[cpu])
      cores[cpu] = newCore()
    cores[cpu][mode] = value
  })
  const totalCpus = Object.keys(cores).length
  const totalAll = Object.keys(cores).reduce((acc, cpu) => acc + cores[cpu].user + cores[cpu].system + cores[cpu].idle, 0)
  const totalUsage = Object.keys(cores).reduce((acc, cpu) => acc + cores[cpu].user + cores[cpu].system, 0)
  const totalIdle = Object.keys(cores).reduce((acc, cpu) => acc + cores[cpu].idle, 0)
  const cpuUsage = (totalUsage / totalAll) * 100
  return {
    cores,
    cpuUsage,
    total: Number(totalAll.toFixed(2)),
    used: Number(totalUsage.toFixed(2)),
    idle: Number(totalIdle.toFixed(2)),
    numberOfCores: totalCpus,
  }
}

export function getCpu(c: Context) {
  return getAllMetrics(c)
    .then((lines) => {
      const cpuInfo = getCpuInfo(getOneMetrics('node_cpu_seconds_total', lines))
      const cpuUsage = Math.round(cpuInfo.cpuUsage * 100) / 100
      // console.log(c.get('requestId'), 'CPU cores info: ', cpuInfo.cores)
      // console.log(c.get('requestId'), 'CPU cores: ', cpuInfo.numberOfCores)
      // console.log(c.get('requestId'), 'CPU total: ', cpuInfo.total)
      // console.log(c.get('requestId'), 'CPU used: ', cpuInfo.used)
      // console.log(c.get('requestId'), 'CPU idle: ', cpuInfo.idle)
      console.log({ requestId: c.get('requestId'), context: 'CPU %', cpu: cpuUsage })
      return cpuUsage
    })
}

export function getMemTotal(lines: string[]) {
  const total = lines.reduce((acc, line) => {
    const parts = line.split(' ')
    const value = Number.parseFloat(parts[1])
    return acc + value
  }, 0)
  return total
}

export function getMemAvailable(lines: string[]) {
  const total = lines.reduce((acc, line) => {
    const parts = line.split(' ')
    const value = Number.parseFloat(parts[1])
    return acc + value
  }, 0)
  return total
}

export function getMemFree(lines: string[]) {
  const total = lines.reduce((acc, line) => {
    const parts = line.split(' ')
    const value = Number.parseFloat(parts[1])
    return acc + value
  }, 0)
  return total
}

export function getMem(c: Context) {
  return getAllMetrics(c)
    .then((lines) => {
      const available = getMemAvailable(getOneMetrics('node_memory_MemAvailable_bytes', lines))
      const total = getMemTotal(getOneMetrics('node_memory_MemTotal_bytes', lines))
      const percentUsed = 100 - ((available * 100) / total)
      const usedPercentageRound = Math.round(percentUsed * 100) / 100
      // console.log(c.get('requestId'), 'Memory available: ', available)
      // console.log(c.get('requestId'), 'Memory free: ', total)
      console.log({ requestId: c.get('requestId'), context: 'Memory %', memory: usedPercentageRound })
      return usedPercentageRound
    })
}

// getMem()
// getCpu()
