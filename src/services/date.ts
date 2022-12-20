import dayjs from 'dayjs'

export const formatDate = (date: string | undefined) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

export const getDaysInCurrentMonth = () => {
  const date = new Date()

  return new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate()
}

export const getCurrentDayMonth = () => {
  const date = new Date()

  return date.getDate()
}
