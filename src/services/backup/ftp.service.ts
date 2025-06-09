import { Client as FTPClient } from 'basic-ftp'
import * as path from 'path'
import { ServerConfig } from '../../types'
import { ensureDirectoryExists } from '../../utils/file'

export class FTPService {
    private client: FTPClient

    constructor(private config: ServerConfig) {
        this.client = new FTPClient(60000)
        this.client.ftp.verbose = true
    }

    async connect(): Promise<void> {
        try {
            await this.client.access({
                host: this.config.host,
                port: this.config.port,
                user: this.config.username,
                password: this.config.password,
                secure: true,
            })
        } catch (err) {
            console.log('Безопасное подключение не удалось, пробуем небезопасное...')
            await this.client.access({
                host: this.config.host,
                port: this.config.port,
                user: this.config.username,
                password: this.config.password,
                secure: false,
            })
        }

        await this.client.send('PASV')
    }

    async downloadFolder(tempDir: string): Promise<void> {
        try {
            await this.connect()
            console.log('Подключено. Переход в директорию...')
            await this.client.cd(this.config.remoteDir)

            console.log('Получение списка файлов...')
            const list = await this.client.list()

            ensureDirectoryExists(tempDir)

            console.log(`Найдено ${list.length} файлов для скачивания`)
            for (const item of list) {
                console.log(`Скачивание ${item.name}...`)
                await this.client.downloadTo(path.join(tempDir, item.name), item.name)
            }
        } finally {
            this.client.close()
        }
    }
}
