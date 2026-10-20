import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  CustomerSchema,
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  PartnerSchema,
  WaitingListEntrySchema,
  WaitingListSchema,
} from '../../schemas';
import { WaitingList } from '../../../../domain/entities/waiting-list.entity';
import { WaitingListMysqlRepository } from '../waiting-list-mysql.repository';
import { Customer } from '../../../../domain/entities/customer.entity';
import { CustomerMysqlRepository } from '../customer-mysql.repository';
import { Partner } from '../../../../domain/entities/partner.entity';
import { PartnerMysqlRepository } from '../partner-mysql.repository';
import { EventMysqlRepository } from '../event-mysql.repository';
import { EventSectionId } from '../../../../domain/entities/event-section';
import { WaitingListStatus } from '../../../../domain/entities/waiting-list-entry.entity';

describe('WaitingListMysqlRepository Integration Tests', () => {
  let orm: MikroORM<MySqlDriver>;

  beforeEach(async () => {
    orm = await MikroORM.init<MySqlDriver>({
      entities: [
        PartnerSchema,
        CustomerSchema,
        EventSchema,
        EventSectionSchema,
        EventSpotSchema,
        WaitingListSchema,
        WaitingListEntrySchema,
      ],
      dbName: 'events',
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'root',
      type: 'mysql',
      forceEntityConstructor: true,
    });
    await orm.schema.refreshDatabase();
  });

  afterEach(async () => {
    await orm.close();
  });

  it('deve persistir uma lista de espera com entradas e recarregá-la na ordem correta', async () => {
    const em = orm.em.fork();
    const partnerRepo = new PartnerMysqlRepository(em);
    const customerRepo = new CustomerMysqlRepository(em);
    const eventRepo = new EventMysqlRepository(em);
    const waitingListRepo = new WaitingListMysqlRepository(em);

    const partner = Partner.create({ name: 'Partner 1' });
    await partnerRepo.add(partner);

    const customer1 = Customer.create({ name: 'Customer 1', cpf: '11111111111' });
    const customer2 = Customer.create({ name: 'Customer 2', cpf: '22222222222' });
    await customerRepo.add(customer1);
    await customerRepo.add(customer2);

    const event = partner.initEvent({
      name: 'Event 1',
      date: new Date(),
      description: 'Event 1 description',
    });
    event.addSection({
      name: 'Section 1',
      description: 'Section 1 description',
      price: 100,
      total_spots: 10,
    });
    await eventRepo.add(event);

    await em.flush();

    const section = event.sections[0];
    const waitingList = WaitingList.create({
      event_id: event.id,
      section_id: section.id,
    });

    waitingList.addEntry(customer1.id);
    waitingList.addEntry(customer2.id);

    await waitingListRepo.add(waitingList);
    await em.flush();
    await em.clear();

    const loadedWaitingList = await waitingListRepo.findById(waitingList.id);
    expect(loadedWaitingList).not.toBeNull();
    expect(loadedWaitingList.event_id.equals(event.id)).toBe(true);
    expect(loadedWaitingList.section_id.equals(section.id)).toBe(true);
    expect(loadedWaitingList.entries.size).toBe(2);

    const entries = [...loadedWaitingList.entries];
    expect(entries[0].customer_id.equals(customer1.id)).toBe(true);
    expect(entries[0].status).toBe(WaitingListStatus.PENDING);
    expect(entries[0].sequence).toBe(1);

    expect(entries[1].customer_id.equals(customer2.id)).toBe(true);
    expect(entries[1].status).toBe(WaitingListStatus.PENDING);
    expect(entries[1].sequence).toBe(2);
  });

  it('deve buscar lista de espera por event_id e section_id', async () => {
    const em = orm.em.fork();
    const partnerRepo = new PartnerMysqlRepository(em);
    const customerRepo = new CustomerMysqlRepository(em);
    const eventRepo = new EventMysqlRepository(em);
    const waitingListRepo = new WaitingListMysqlRepository(em);

    const partner = Partner.create({ name: 'Partner 1' });
    await partnerRepo.add(partner);

    const customer = Customer.create({ name: 'Customer 1', cpf: '33333333333' });
    await customerRepo.add(customer);

    const event = partner.initEvent({
      name: 'Event 1',
      date: new Date(),
      description: 'Event 1 description',
    });
    event.addSection({
      name: 'Section 1',
      description: 'Section 1 description',
      price: 100,
      total_spots: 10,
    });
    await eventRepo.add(event);

    await em.flush();

    const section = event.sections[0];
    const waitingList = WaitingList.create({
      event_id: event.id,
      section_id: section.id,
    });
    waitingList.addEntry(customer.id);

    await waitingListRepo.add(waitingList);
    await em.flush();
    await em.clear();

    const found = await waitingListRepo.findByEventIdAndSectionId(
      event.id,
      section.id,
    );
    expect(found).not.toBeNull();
    expect(found.id.equals(waitingList.id)).toBe(true);
    expect(found.entries.size).toBe(1);

    const notFound = await waitingListRepo.findByEventIdAndSectionId(
      event.id,
      new EventSectionId(),
    );
    expect(notFound).toBeNull();
  });
});
