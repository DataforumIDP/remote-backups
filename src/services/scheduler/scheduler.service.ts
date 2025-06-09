import { SchedulerConfig } from '../../types'
import { getNextRunTime, sleep } from '../../utils/date'

export class SchedulerService {
    constructor(private config: SchedulerConfig, private task: () => Promise<void>) {}

    async start(): Promise<never> {
        console.log(
            `Планировщик резервного копирования запущен. Интервал: ${this.config.interval} часов, ` +
                `Время старта: ${this.config.startTime}`
        )

        while (true) {
            const nextRun = getNextRunTime(this.config.startTime, this.config.interval)
            const now = new Date()
            const waitTime = nextRun.getTime() - now.getTime()

            console.log(
                `Следующее резервное копирование запланировано на: ${nextRun.toLocaleString()}`
            )

            await sleep(waitTime)

            console.log('Запуск запланированного резервного копирования...')
            await this.task()

            // Sleep for 1 minute to avoid potential duplicate runs
            await sleep(60000)
        }
    }
}
