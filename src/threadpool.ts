import { EventEmitter } from "node:events";
import { Worker } from "node:worker_threads";

import {
    IParallelOptions
} from "./parallel.interface";

export class ThreadPool extends EventEmitter {
    public static pools = new Map<string, ThreadPool>();
    protected threads: Array<Worker> = new Array<Worker>();
    private totalDataSend: number = 0;
    private totalTreadReturn: number = 0;
    private threadWorkPointer: number = 0;
    private endDataMark: boolean = false;

    constructor(
        options: IParallelOptions,
        fn: Function,
        schema: any
    ){
        super();
        this.createThreads(options, fn, schema);
    }

    public static getThreadPool(namespace: string){
        return ThreadPool.pools.has(namespace) ? 
            ThreadPool.pools.get(namespace) : null;
    }

    public static creataThreadPool(
        options: IParallelOptions, 
        fn: Function, 
        schema: any
    ){
        ThreadPool.pools.set(options.namespace, new ThreadPool(options, fn, schema));
    }

    public createThreads(
        options: IParallelOptions, 
        fn: Function,
        schema: any
    ){
        const workerCode = `
        const { parentPort, workerData, threadId } = require('worker_threads');

        (async () => {
            try {
                let { fn, schema } = workerData;
                const executeFn = new Function('return (' + fn + ')')();
                schema = JSON.parse(schema);

                parentPort.on('message', async (payload) => {
                    try {
                        const args = new Array(schema.params.length);

                        for (const param of schema.params) {
                            if (param.paramType === "data") 
                                args[param.index] = JSON.parse(payload);
                            else if (param.paramType === "thread") 
                                args[param.index] = { threadId: threadId, parentPort };            
                        }

                        await executeFn(...args);
                    } catch (error) {
                        console.error(\`Thread [\${workerData.threadId}]: \`, error.message)
                        parentPort.postMessage({ error: error.message });
                    }
                });
            } catch (error) {
                console.log(error)
                parentPort.postMessage({ error: error.message });
            }
        })();`;

        for(let i = 0; i < options.threads; i++){
            const worker = new Worker(workerCode, {
                eval: true,
                workerData: { 
                    fn: this.transformFunction(fn), 
                    schema: JSON.stringify(schema) 
                }
            });
    
            worker.on("message", (data) => {
                this.totalTreadReturn++;
                this.emit('data', data);

                if(this.endDataMark && this.totalDataSend === this.totalTreadReturn)
                    this.emit('end');
            });
            
            worker.on("error", () => this.emit('error'));
            worker.on("exit", (code) => {
                this.emit('error', `Worker stopped with exit code ${code}`);
            });

            this.threads.push(worker);
        }
    }

    public send(payload: object | string, schema: any) {
        if (this.threads.length === 0) {
            console.error("No workers available")
            throw new Error("No workers available");
        }  

        if(typeof payload === "object" && !schema)
            payload = JSON.stringify(payload);
        else if(typeof payload === "object" && schema)
            payload = schema(payload);

        this.threadWorkPointer++;
        const randomIndex = Math.floor(Math.random() * this.threads.length);
        const worker = this.threads[randomIndex];

        if (worker) {
            this.totalDataSend++;
            worker.postMessage(payload);
        } else {
            console.error("No available worker found.")
            throw new Error("No available worker found.");
        }
    }

    public endData(){
        this.endDataMark = true;
    }

    public flush(){
        this.totalDataSend = 0;
        this.totalTreadReturn = 0;
        this.threadWorkPointer = 0;
        this.endDataMark = false;
    }

    private transformFunction(fn: Function): string {
        const fnString = fn.toString().replace(/^async\s+\w+\s*\((.*?)\)/, 'async ($1) =>');
        return `(${fnString})`;
    }

    private awaitEnd(){
        return new Promise((resolve, reject) => {
            try{
                let persistence = setInterval(() => {
                    if(this.endDataMark && this.totalDataSend === this.totalTreadReturn){
                        clearInterval(persistence);
                        resolve(true);
                    }
                }, 100);
            }
            catch{ resolve(false); }
        });
    }
}