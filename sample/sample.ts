import * as fs from 'node:fs';
import * as path from 'node:path';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';

import { 
    Application, Hooks,
    HooksType

} from "@cmmv/core";

import {
    AbstractParallel,
    Parallel, Tread, 
    ThreadData, ParallelModule, 
    ParallelProvider
} from "../src";

export class ReadBigFile extends AbstractParallel {
    async start() {
        const instance = ReadBigFile.getInstance();
        const finalData = new Array<any>();
        const poolNamespace= "parserLine";
        const pool = instance.getThreadPool(poolNamespace);
        const filename = path.resolve('./large-customers.json');

        if(pool){
            const readStream = fs.createReadStream(path.resolve(filename));
            const jsonStream = readStream.pipe(parser()).pipe(streamArray());
            pool.on('data', (parsedData, index: number) => finalData[index] = parsedData);
            pool.on('end', () => console.log(finalData));
    
            jsonStream.on('data', ({ value }) => pool.send(value));
            jsonStream.on('end', pool.endData());
            jsonStream.on('error', error => console.error(error));
        }
        else {
            throw new Error(`Thread pool '${poolNamespace}' not found`);
        }
    }

    @Parallel({
        namespace: "parserLine",
        threads: 1
    })
    async parserLine(@Tread() thread: any, @ThreadData() payload: any){
        const { 
            JSONParser, AbstractParserSchema,
            ToObjectId, ToLowerCase, ToDate 
        } = await import("@cmmv/normalizer");

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

        const jsonParser = new JSONParser({ schema: CustomerSchema });
        thread.send(await jsonParser.parser(payload));
    }
}

Application.exec({
    modules: [ParallelModule],
    services: [ParallelProvider, ReadBigFile]
});