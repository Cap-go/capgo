import dayjs from 'dayjs'

export function formatDate(date: string | undefined) {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

export function getDaysInCurrentMonth() {
  const date = new Date()

  return new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate()
}

export function getCurrentDayMonth() {
  const date = new Date()

  return date.getDate()
}
