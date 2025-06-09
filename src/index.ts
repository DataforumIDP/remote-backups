import { config } from './config/config'
import { BackupService } from './services/backup/backup.service'
import { SchedulerService } from './services/scheduler/scheduler.service'

async function main() {
    const backupService = new BackupService(config)
    const schedulerService = new SchedulerService(config, () => backupService.performBackup())

    try {
        await schedulerService.start()
    } catch (error) {
        console.error('Ошибка приложения:', error)
        process.exit(1)
    }
}

main()
