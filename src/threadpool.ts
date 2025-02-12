import { EventEmitter } from "node:events";
import { Worker } from "node:worker_threads";

import { 
    createObjectBuffer, getUnderlyingArrayBuffer,
    loadObjectBuffer 
} from "@bnaya/objectbuffer";

import {
    IParallelOptions
} from "./parallel.interface";

import { 
    ParallelRegistry 
} from "./parallel.registry";

export class ThreadPool extends EventEmitter {
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

    public createThreads(
        options: IParallelOptions, 
        fn: Function,
        schema: any
    ){
        const workerCode = `
        const { parentPort, workerData } = require('worker_threads');

        (async () => {
            try {
                const { fn, schema } = workerData;
                const executeFn = new Function('return (' + fn + ')')();

                parentPort.once('message', async (payload) => {
                    try {
                        console.log(payload);
                        const args = new Array(schema.params.length);

                        for (const param of schema.params) {
                            if (param.paramType === "data") 
                                args[param.index] = payload;
                            else if (param.paramType === "thread") 
                                args[param.index] = { threadId: workerData.threadId };            
                        }

                        const result = await executeFn(...args);
                        parentPort.postMessage(result);
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

    public send(payload: any){
        if (this.threads.length === 0) 
            throw new Error("No workers available");

        this.threadWorkPointer++;
        const randomIndex = Math.floor(Math.random() * this.threads.length);
        const worker = this.threads[randomIndex];

        if (worker) {
            this.totalDataSend++;
            worker.postMessage(payload);
        } else {
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
}