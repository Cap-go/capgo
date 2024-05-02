import { listen } from 'bun'
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'

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
  datesFields.forEach((field) => {
    if (newObj[field])
      newObj[field] = formatDateCH(newObj[field])
  })
  return newObj
}

export function getMonthSubscriptionDates(start: string, end: string) {
  dayjs.extend(isBetween)
  dayjs.extend(isSameOrBefore)

  const startDate = dayjs(start)
  const endDate = dayjs(end)
  const today = dayjs()

  let finalEndDate = startDate.add(1, 'month')
  let finalStartDate = startDate

  while (finalEndDate.isSameOrBefore(endDate)) {
    if (today.isBetween(finalStartDate, finalEndDate, 'milliseconds', '[]'))
      return [finalStartDate.toDate(), finalEndDate.toDate()]

    finalEndDate = finalEndDate.add(1, 'month')
    finalStartDate = finalStartDate.add(1, 'month')
  }

  throw new Error(
    `Could not find correct subscription dates based on months.\n
    Start: ${startDate.toString()} (${startDate.millisecond()})
    End: ${endDate.toString()} (${endDate.millisecond()})
    Today: ${today.toString()} (${today.millisecond()})`,
  )
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
