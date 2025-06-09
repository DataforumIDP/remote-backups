export function getNextRunTime(startTime: string, intervalHours: number): Date {
    const [hours, minutes] = startTime.split(':').map(Number)
    const now = new Date()
    let nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes)

    if (nextRun <= now) {
        nextRun.setTime(nextRun.getTime() + intervalHours * 60 * 60 * 1000)
    }

    return nextRun
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}
