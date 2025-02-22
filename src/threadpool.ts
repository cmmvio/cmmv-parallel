import { EventEmitter } from 'node:events';
import { FastThread } from 'fast-thread';

import { IParallelOptions } from './parallel.interface';

export class ThreadPool extends EventEmitter {
    public options: IParallelOptions;
    public static pools = new Map<string, ThreadPool>();
    protected threads: Array<FastThread> = [];
    private totalTreadReturn: number = 1;
    private endDataMark: boolean = false;
    private threadIndex = 0;
    private sentEnd = false;
    private ready = 0;

    private pendingMessages: Map<number, Array<object | string>> = new Map();

    constructor(
        options: IParallelOptions,
        fn: Function,
        schema: any,
        context?: Function,
    ) {
        super();
        this.createThreads(options, fn, schema, context);
    }

    public static getThreadPool(namespace: string) {
        return ThreadPool.pools.has(namespace)
        ? ThreadPool.pools.get(namespace)
        : null;
    }

    public static hasThreadPool(namespace: string) {
        return ThreadPool.pools.has(namespace);
    }

    public static createThreadPool(
        options: IParallelOptions,
        fn: Function,
        schema: any,
        context?: Function,
    ) {
        ThreadPool.pools.set(
            options.namespace,
            new ThreadPool(options, fn, schema, context),
        );
    }

    public createThreads(
        options: IParallelOptions,
        fn: Function,
        schema: any,
        context?: Function,
    ) {
        this.options = options;

        const workerCode = `
            const { parentPort, workerData, threadId } = require('worker_threads');
            const { unpackObject, packObject } = require("fast-thread");

            (async () => {
                try {
                    let { schema } = workerData;
                    const sharedBuffer = workerData;
                    const contextFn = ${context ? this.transformFunction(context) : 'null'};
                    const scope = (contextFn) ? await contextFn() : {};
                    const executeFn = ${this.transformFunction(fn)};
                    schema = JSON.parse(schema);

                    async function processData() {
                        while (true) {
                            Atomics.wait(sharedBuffer.signal, 0, 0);
                            Atomics.notify(sharedBuffer.signal, 0, 0);
                            let payload = unpackObject(sharedBuffer, 0);

                            if (!payload) continue;

                            let args = new Array(schema.params.length);

                            for (const param of schema.params) {
                                if (param.paramType === "data")
                                    args[param.index] = payload;
                                else if (param.paramType === "thread")
                                    args[param.index] = { threadId, ...scope };
                            }

                            try {
                                if(!payload.processed){
                                    const result = await executeFn(...args);
                                    packObject(JSON.stringify({ result, processed: true }), sharedBuffer, 1);
                                }
                            } catch (error) {
                                console.log(payload)
                                console.log(error);
                            }
                        }
                    }

                    setImmediate(async () => await processData());
                } catch (error) {
                    console.log(error);
                }
            })();`;

        for (let i = 0; i < options.threads; i++) {
            const worker = new FastThread(workerCode, 1024 * 1024, {
                eval: true,
                stdout: true,
                workerData: {
                    fn: this.transformFunction(fn),
                    schema: JSON.stringify(schema),
                },
            });

            worker.on("online", () => this.ready++);
            worker.on("message", (data) => {
                if(data && data.processed)
                    this.emit('message', data.result)
            });
            worker.on("error", () => this.emit('error', `Worker stopped with exit`));
            worker.on("exit", (code) => this.emit('error', `Worker stopped with exit code ${code}`));

            this.threads.push(worker);
        }
    }

    public async send(
        payload: object | string,
        schema?: any,
        workerIndex = -1
    ) {
        if (this.threads.length === 0) {
            console.error('No workers available');
            throw new Error('No workers available');
        }

        const workerId = workerIndex >= 0 ? workerIndex : this.threadIndex;
        const worker = this.threads[workerId];
        this.threadIndex = (this.threadIndex + 1) % this.threads.length;

        if (worker) {
            if (worker.isBusy) {
                if (!this.pendingMessages.has(worker.threadId))
                    this.pendingMessages.set(worker.threadId, []);

                this.pendingMessages.get(worker.threadId)?.push(payload);
                return;
            }

            if (typeof payload === 'object' && schema)
                payload = schema(payload);

            worker.isBusy = true;
            await worker.send(payload);
            await worker.awaitThreadReponse();
            this.totalTreadReturn++;
            worker.isBusy = false;
            console.log(this.totalTreadReturn);

            if (this.pendingMessages.has(worker.threadId)) {
                const nextPayload = this.pendingMessages.get(worker.threadId)?.shift();

                if (nextPayload)
                    await this.send(nextPayload, schema, workerId);
            }
        }
    }

    public endData() {
        this.endDataMark = true;
    }

    public flush() {
        this.totalTreadReturn = 0;
        this.endDataMark = false;
    }

    public awaitStart(){
        let _this = this;

        return new Promise((resolve, reject) => {
            function validateStart(){
                if(_this.ready >= _this.options.threads)
                    resolve(true);

                setImmediate(validateStart);
            }

            validateStart();
        });
    }

    private transformFunction(fn: Function): string {
        const fnString = fn
            .toString()
            .replace(/^async\s+\w+\s*\((.*?)\)/, 'async ($1) =>');

        return `(${fnString})`;
    }

    private awaitEnd() {
        return new Promise((resolve, reject) => {
            try {
                const _this = this;

                function validateEndProcess(){
                    const allThreadsFree = _this.threads.every(
                        (worker) => !worker.isBusy
                    );

                    if (
                        _this.endDataMark &&
                        !_this.sentEnd &&
                        allThreadsFree
                    ) {
                        _this.sentEnd = true;
                        _this.emit('end');
                        resolve(true);
                    }
                    else {
                        setImmediate(validateEndProcess)
                    }
                }

                validateEndProcess()
            } catch {
                resolve(false);
            }
        });
    }
}
