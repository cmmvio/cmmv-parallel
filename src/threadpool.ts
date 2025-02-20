import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import * as msgpack from 'msgpack-lite';

import { IParallelOptions } from './parallel.interface';

export class ThreadPool extends EventEmitter {
  public static pools = new Map<string, ThreadPool>();
  protected threads: Array<Worker> = [];
  private totalDataSend: number = 0;
  private totalTreadReturn: number = 0;
  private threadWorkPointer: number = 0;
  private endDataMark: boolean = false;
  private threadIndex = 0;
  private sentEnd = false;

  private messageBuffer: any[] = []; // 🔹 Buffer para acumular mensagens antes de enviar
  private batchSize: number = 10; // 🔹 Número de mensagens antes de enviar
  private flushInterval: number = 50; // 🔹 Tempo (ms) antes de enviar buffer acumulado

  constructor(
    options: IParallelOptions,
    fn: Function,
    schema: any,
    context?: Function,
  ) {
    super();
    this.createThreads(options, fn, schema, context);
    setInterval(() => this.flushMessages(), this.flushInterval);
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
    const workerCode = `
        const { parentPort, workerData, threadId } = require('worker_threads');
        const msgpack = require("msgpack-lite");

        (async () => {
            try {
                let { schema } = workerData;
                const contextFn = ${context ? this.transformFunction(context) : 'null'};
                const scope = (contextFn) ? await contextFn() : {};
                const executeFn = ${this.transformFunction(fn)};
                schema = JSON.parse(schema);

                parentPort.on('message', async (payloads) => {
                    try {
                        const results = [];

                        for (const payload of payloads) {
                            const args = new Array(schema.params.length);
        
                            for (const param of schema.params) {
                                if (param.paramType === "data") 
                                    args[param.index] = msgpack.decode(payload);
                                else if (param.paramType === "thread") 
                                    args[param.index] = { threadId, parentPort, ...scope };            
                            }

                            results.push(await executeFn(...args));
                        }
                        
                        parentPort.postMessage(msgpack.encode(results));
                    } catch (error) {
                        console.error(\`Thread [\${workerData.threadId}]: \`, error.message);
                        parentPort.postMessage({ error: error.message });
                    }
                });
            } catch (error) {
                console.log(error);
                parentPort.postMessage({ error: error.message });
            }
        })();`;

    for (let i = 0; i < options.threads; i++) {
      const worker = new Worker(workerCode, {
        eval: true,
        stdout: true,
        workerData: {
          fn: this.transformFunction(fn),
          schema: JSON.stringify(schema),
        },
      });

      worker.stdout.on('data', (data) => {
        console.log(`[Worker] ${data.toString().trim()}`);
      });

      worker.stderr.on('data', (data) => {
        console.error(`[Worker Error] ${data.toString().trim()}`);
      });

      worker.on('message', (data) => {
        data = msgpack.decode(data);
        this.totalTreadReturn += data.length;
        data.forEach((d) => this.emit('data', d));

        if (
          this.endDataMark &&
          !this.sentEnd &&
          this.totalDataSend === this.totalTreadReturn
        ) {
          this.sentEnd = true;
          this.emit('end');
        }
      });

      worker.on('error', () => this.emit('error'));
      worker.on('exit', (code) => {
        this.emit('error', `Worker stopped with exit code ${code}`);
      });

      this.threads.push(worker);
    }
  }

  public send(payload: object | string, schema?: any) {
    if (this.threads.length === 0) {
      console.error('No workers available');
      throw new Error('No workers available');
    }

    if (typeof payload === 'object' && !schema) {
      payload = msgpack.encode(payload);
    } else if (typeof payload === 'object' && schema) {
      payload = schema(payload);
    }

    this.messageBuffer.push(payload);

    if (this.messageBuffer.length >= this.batchSize) this.flushMessages();
  }

  private flushMessages() {
    if (this.messageBuffer.length === 0) return;

    this.threadWorkPointer++;
    const worker = this.threads[this.threadIndex];
    this.threadIndex = (this.threadIndex + 1) % this.threads.length;

    if (worker) {
      this.totalDataSend += this.messageBuffer.length;
      worker.postMessage(this.messageBuffer.splice(0, this.batchSize)); // 🔹 Envia o lote
    }
  }

  public endData() {
    this.endDataMark = true;
  }

  public flush() {
    this.totalDataSend = 0;
    this.totalTreadReturn = 0;
    this.threadWorkPointer = 0;
    this.endDataMark = false;
    this.messageBuffer = [];
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
        let persistence = setInterval(() => {
          if (
            this.endDataMark &&
            !this.sentEnd &&
            this.totalDataSend === this.totalTreadReturn
          ) {
            this.sentEnd = true;
            clearInterval(persistence);
            this.emit('end');
            resolve(true);
          }
        }, 100);
      } catch {
        resolve(false);
      }
    });
  }
}
