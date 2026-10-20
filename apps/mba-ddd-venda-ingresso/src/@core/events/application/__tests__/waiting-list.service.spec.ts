import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  CustomerSchema,
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  OrderSchema,
  PartnerSchema,
  SpotReservationSchema,
  WaitingListEntrySchema,
  WaitingListSchema,
} from '../../infra/db/schemas';
import { CustomerMysqlRepository } from '../../infra/db/repositories/customer-mysql.repository';
import { PartnerMysqlRepository } from '../../infra/db/repositories/partner-mysql.repository';
import { EventMysqlRepository } from '../../infra/db/repositories/event-mysql.repository';
import { WaitingListMysqlRepository } from '../../infra/db/repositories/waiting-list-mysql.repository';
import { UnitOfWorkMikroOrm } from '../../../common/infra/unit-of-work-mikro-orm';
import { DomainEventManager } from '../../../common/domain/domain-event-manager';
import { ApplicationService } from '../../../common/application/application.service';
import { WaitingListService } from '../waiting-list.service';
import { Customer, CustomerId } from '../../domain/entities/customer.entity';
import { Partner } from '../../domain/entities/partner.entity';
import { EventId } from '../../domain/entities/event.entity';
import { EventSectionId } from '../../domain/entities/event-section';

describe('WaitingListService Unit & Integration Tests', () => {
  let orm: MikroORM<MySqlDriver>;

  beforeEach(async () => {
    orm = await MikroORM.init<MySqlDriver>({
      entities: [
        PartnerSchema,
        CustomerSchema,
        EventSchema,
        EventSectionSchema,
        EventSpotSchema,
        OrderSchema,
        SpotReservationSchema,
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

  it('deve lançar erro quando o cliente não for encontrado', async () => {
    const em = orm.em.fork();
    const uow = new UnitOfWorkMikroOrm(em);
    const domainEventManager = new DomainEventManager();
    const appService = new ApplicationService(uow, domainEventManager);

    const service = new WaitingListService(
      new WaitingListMysqlRepository(em),
      new CustomerMysqlRepository(em),
      new EventMysqlRepository(em),
      appService,
    );

    await expect(
      service.join({
        customer_id: new CustomerId().value,
        event_id: new EventId().value,
        section_id: new EventSectionId().value,
      }),
    ).rejects.toThrow('Customer not found');
  });

  it('deve lançar erro quando o evento não for encontrado', async () => {
    const em = orm.em.fork();
    const uow = new UnitOfWorkMikroOrm(em);
    const domainEventManager = new DomainEventManager();
    const appService = new ApplicationService(uow, domainEventManager);

    const customerRepo = new CustomerMysqlRepository(em);
    const customer = Customer.create({
      name: 'Customer 1',
      cpf: '70375887091',
    });
    await customerRepo.add(customer);
    await uow.commit();

    const service = new WaitingListService(
      new WaitingListMysqlRepository(em),
      customerRepo,
      new EventMysqlRepository(em),
      appService,
    );

    await expect(
      service.join({
        customer_id: customer.id.value,
        event_id: new EventId().value,
        section_id: new EventSectionId().value,
      }),
    ).rejects.toThrow('Event not found');
  });

  it('deve lançar erro quando a seção não for encontrada no evento', async () => {
    const em = orm.em.fork();
    const uow = new UnitOfWorkMikroOrm(em);
    const domainEventManager = new DomainEventManager();
    const appService = new ApplicationService(uow, domainEventManager);

    const partnerRepo = new PartnerMysqlRepository(em);
    const customerRepo = new CustomerMysqlRepository(em);
    const eventRepo = new EventMysqlRepository(em);

    const partner = Partner.create({ name: 'Partner 1' });
    await partnerRepo.add(partner);
    const customer = Customer.create({
      name: 'Customer 1',
      cpf: '70375887091',
    });
    await customerRepo.add(customer);

    const event = partner.initEvent({
      name: 'Event 1',
      description: 'Desc',
      date: new Date(),
    });
    await eventRepo.add(event);
    await uow.commit();

    const service = new WaitingListService(
      new WaitingListMysqlRepository(em),
      customerRepo,
      eventRepo,
      appService,
    );

    await expect(
      service.join({
        customer_id: customer.id.value,
        event_id: event.id.value,
        section_id: new EventSectionId().value,
      }),
    ).rejects.toThrow('Section not found');
  });

  it('deve lançar erro quando a seção não estiver esgotada', async () => {
    const em = orm.em.fork();
    const uow = new UnitOfWorkMikroOrm(em);
    const domainEventManager = new DomainEventManager();
    const appService = new ApplicationService(uow, domainEventManager);

    const partnerRepo = new PartnerMysqlRepository(em);
    const customerRepo = new CustomerMysqlRepository(em);
    const eventRepo = new EventMysqlRepository(em);

    const partner = Partner.create({ name: 'Partner 1' });
    await partnerRepo.add(partner);
    const customer = Customer.create({
      name: 'Customer 1',
      cpf: '70375887091',
    });
    await customerRepo.add(customer);

    const event = partner.initEvent({
      name: 'Event 1',
      description: 'Desc',
      date: new Date(),
    });
    event.addSection({
      name: 'Section 1',
      description: 'Desc',
      price: 100,
      total_spots: 2,
    });
    event.publishAll();
    await eventRepo.add(event);
    await uow.commit();

    const service = new WaitingListService(
      new WaitingListMysqlRepository(em),
      customerRepo,
      eventRepo,
      appService,
    );

    await expect(
      service.join({
        customer_id: customer.id.value,
        event_id: event.id.value,
        section_id: event.sections[0].id.value,
      }),
    ).rejects.toThrow('Section is not sold out');
  });

  it('deve permitir entrar na lista de espera quando a seção estiver esgotada', async () => {
    const em = orm.em.fork();
    const uow = new UnitOfWorkMikroOrm(em);
    const domainEventManager = new DomainEventManager();
    const appService = new ApplicationService(uow, domainEventManager);

    const partnerRepo = new PartnerMysqlRepository(em);
    const customerRepo = new CustomerMysqlRepository(em);
    const eventRepo = new EventMysqlRepository(em);
    const waitingListRepo = new WaitingListMysqlRepository(em);

    const partner = Partner.create({ name: 'Partner 1' });
    await partnerRepo.add(partner);
    const customer = Customer.create({
      name: 'Customer 1',
      cpf: '70375887091',
    });
    await customerRepo.add(customer);

    const event = partner.initEvent({
      name: 'Event 1',
      description: 'Desc',
      date: new Date(),
    });
    event.addSection({
      name: 'Section 1',
      description: 'Desc',
      price: 100,
      total_spots: 1,
    });
    event.publishAll();

    // Reserva o único lugar
    const section = event.sections[0];
    event.markSpotAsReserved({
      section_id: section.id,
      spot_id: section.spots[0].id,
    });
    await eventRepo.add(event);
    await uow.commit();

    const service = new WaitingListService(
      waitingListRepo,
      customerRepo,
      eventRepo,
      appService,
    );

    const entry = await service.join({
      customer_id: customer.id.value,
      event_id: event.id.value,
      section_id: section.id.value,
    });

    expect(entry.customer_id.equals(customer.id)).toBe(true);

    const list = await service.list(event.id.value, section.id.value);
    expect(list).toHaveLength(1);
    expect(list[0].customer_id).toBe(customer.id.value);
    expect(list[0].status).toBe('PENDING');
  });
});
