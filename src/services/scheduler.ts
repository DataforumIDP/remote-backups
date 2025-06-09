import { config } from '../config/env';
import { sleep, getNextRunTime } from '../utils/helpers';

export async function runScheduled(mainFunction: () => Promise<void>): Promise<never> {
    console.log(`Backup scheduler started. Interval: ${config.interval} hours, Start time: ${config.startTime}`);

    while (true) {
        const nextRun = getNextRunTime(config.startTime, config.interval);
        const now = new Date();
        const waitTime = nextRun.getTime() - now.getTime();

        console.log(`Next backup scheduled for: ${nextRun.toLocaleString()}`);
        
        await sleep(waitTime);
        
        console.log('Starting scheduled backup...');
        await mainFunction();
        
        // Sleep for 1 minute to avoid potential duplicate runs
        await sleep(60000);
    }
}
