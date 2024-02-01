import dayjs from 'dayjs'

export function formatDate(date: string | undefined) {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

export function formatDateCH(date: string | undefined) {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

export function convertAllDatesToCH(obj: any) {
  // look in all objects for dates fields ( created_at or updated_at ) and convert them if need
  const datesFields = ['created_at', 'updated_at']
  const newObj = { ...obj }
  datesFields.forEach(field => {
    if (newObj[field]) {
      newObj[field] = formatDateCH(newObj[field])
    }
  })
  return newObj
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
