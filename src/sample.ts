import * as fs from 'node:fs';
import * as path from 'node:path';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';

import { Service } from "@cmmv/core";

import { 
    JSONParser, AbstractParserSchema,
    ToObjectId, ToLowerCase, ToDate 
} from "@cmmv/normalizer";

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

@Service()
export class ReadBigFile extends AbstractParallel {
    async readFileParallel(filename: string) {
        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(
                path.resolve(filename),
            );
            const finalData = [];
    
            const jsonStream = readStream.pipe(parser()).pipe(streamArray());
            const pool = this.getThreadPool("parserLine");
    
            pool.on('data', (parsedData, index) => finalData[index] = parsedData);
            pool.on('end', () => resolve(finalData));
    
            jsonStream.on('data', ({ value }) => pool.send(value));
            jsonStream.on('end', pool.endData());
            jsonStream.on('error', error => reject(error));
        });
    }

    @Parallel({
        namespace: "parserLine",
        threads: 4,
        providers: {
            jsonParser: new JSONParser({ 
                schema: CustomerSchema
            })
        }
    })
    async parserLine(
        @Tread() thread, 
        @ThreadData() payload
        @ThreadProvider("jsonParser") jsonParser
    ){
        thread.send(await jsonParser.parser(payload));
    }
}