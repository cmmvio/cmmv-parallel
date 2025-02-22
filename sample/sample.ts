//@ts-nocheck
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import * as msgpack from "msgpack-lite";

import {
    Application, Hooks,
    HooksType, Hook
} from "@cmmv/core";

import {
    AbstractParallel,
    Parallel, Tread,
    ThreadData, ParallelModule,
    ParallelProvider, ThreadPool,
    TreadContext
} from "../src/main";

export class ReadBigFileWithParallel extends AbstractParallel {
    @Hook(HooksType.onInitialize)
    async start() {
        const finalData = new Array<any>();
        const poolNamespace= "parserLine";
        const pool = ThreadPool.getThreadPool(poolNamespace);
        const filename = path.resolve('./sample/large-customers.json');

        if(pool){
            let start;
            console.log('Parser With Multi-Thread...');
            const readStream = fs.createReadStream(path.resolve(filename));
            await pool.awaitStart();
            const jsonStream = readStream.pipe(parser()).pipe(streamArray());

            pool.on('message', async (response) => {
                finalData[response.index] = response.data;
            });

            pool.on('end', () => {
                const end = Date.now();
                console.log(`Parallel parser: ${finalData.length} | ${(end - start).toFixed(2)}s`);
            });

            jsonStream.on('data', async ({ value, key }) => {
                if(!start)
                    start = Date.now();

                pool.send({ value, index: key });
            });

            jsonStream.on('end', () => pool.endData());
            jsonStream.on('error', error => console.error(error));

            await pool.awaitEnd();
        }
        else {
            throw new Error(`Thread pool '${poolNamespace}' not found`);
        }
    }

    @Parallel({
        namespace: "parserLine",
        threads: 3
    })
    async parserLine(@Tread() thread: any, @ThreadData() payload: any) {
        return {
            data: await thread.jsonParser.parser(payload.value),
            index: payload.index
        }
    }

    @TreadContext("parserLine")
    async threadContext() {
        const {
            JSONParser, AbstractParserSchema,
            ToObjectId, ToLowerCase, ToDate
        } = await import("@cmmv/normalizer");

        class CustomerSchema extends AbstractParserSchema {
            public field = {
                id: { to: 'id' },
                name: { to: 'name' },
                email: {
                    to: 'email',
                    validation: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
                    transform: [ToLowerCase],
                },
                registrationDate: {
                    to: 'createdAt',
                    transform: [ToDate],
                },
            };
        }

        const jsonParser = new JSONParser({ schema: CustomerSchema });
        return { jsonParser };
    }
}

export class ReadBigFileWithoutParallel {
    @Hook(HooksType.onInitialize)
    async start() {
        const {
            JSONParser, AbstractParserSchema,
            ToObjectId, ToLowerCase, ToDate
        } = await import("@cmmv/normalizer");
        const finalData = new Array<any>();
        const poolNamespace= "parserLine";
        const pool = ThreadPool.getThreadPool(poolNamespace);
        const filename = path.resolve('./sample/large-customers.json');

        if(pool){
            const start = Date.now();
            console.log('Parser Without Multi-Thread...');

            class CustomerSchema extends AbstractParserSchema {
                public field = {
                    id: {
                        to: 'id',
                        transform: [ToObjectId],
                    },
                    name: { to: 'name' },
                    email: {
                        to: 'email',
                        validation: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
                        transform: [ToLowerCase],
                    },
                    registrationDate: {
                        to: 'createdAt',
                        transform: [ToDate],
                    },
                };
            }

            const jsonParser = new JSONParser({
                schema: CustomerSchema,
                input: filename
            })
            .pipe(async data => finalData.push(data))
            .once('end', () => {
                const end = Date.now();
                console.log(`Single parser: ${finalData.length} | ${(end - start).toFixed(2)}s`);
            })
            .once('error', (error) => console.error(error))
            .start();
        }
        else {
            throw new Error(`Thread pool '${poolNamespace}' not found`);
        }
    }
}

Application.exec({
    modules: [ParallelModule],
    services: [ParallelProvider]
});
