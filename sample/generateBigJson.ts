import * as fs from 'node:fs';
import { faker } from '@faker-js/faker';

interface Customer {
    id: number;
    name: string;
    email: string;
    phoneNumber: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    registrationDate: string;
}

const generateCustomerData = (id: number): Customer => ({
    id,
    name: faker.person.fullName(),
    email: faker.internet.email(),
    phoneNumber: faker.phone.number({ style: 'national' }),
    address: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state(),
    zipCode: faker.location.zipCode(),
    registrationDate: faker.date.past().toISOString(),
});

const generateLargeJSON = async (
    filePath: string,
    totalRecords: number,
): Promise<void> => {
    const writeStream = fs.createWriteStream(filePath);
    writeStream.write('[');

    for (let i = 1; i <= totalRecords; i++) {
        const customer = generateCustomerData(i);
        writeStream.write(JSON.stringify(customer));

        if (i < totalRecords) writeStream.write(',');

        if (i % 10000 === 0) console.log(`Generated ${i} records...`);
    }

    writeStream.write(']');
    writeStream.end();

    console.log(
        `JSON file with ${totalRecords} records generated at ${filePath}`,
    );
};

generateLargeJSON('./sample/large-customers.json', 100000);