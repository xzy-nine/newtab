import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

export function ClockWidget() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const time = format(now, 'HH:mm', { locale: zhCN })
  const date = format(now, 'yyyy年MM月dd日 EEEE', { locale: zhCN })

  return (
    <div className="text-center">
      <div className="text-6xl font-light text-white drop-shadow-lg">
        {time}
      </div>
      <div className="text-lg text-white/80 drop-shadow-md mt-2">
        {date}
      </div>
    </div>
  )
}
