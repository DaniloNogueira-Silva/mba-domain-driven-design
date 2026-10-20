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
import { StoredEventSchema } from '../../../stored-events/infra/db/schemas';
import { CustomerMysqlRepository } from '../../infra/db/repositories/customer-mysql.repository';
import { PartnerMysqlRepository } from '../../infra/db/repositories/partner-mysql.repository';
import { EventMysqlRepository } from '../../infra/db/repositories/event-mysql.repository';
import { OrderMysqlRepository } from '../../infra/db/repositories/order-mysql.repository';
import { SpotReservationMysqlRepository } from '../../infra/db/repositories/spot-reservation-mysql.repository';
import { WaitingListMysqlRepository } from '../../infra/db/repositories/waiting-list-mysql.repository';
import { UnitOfWorkMikroOrm } from '../../../common/infra/unit-of-work-mikro-orm';
import { DomainEventManager } from '../../../common/domain/domain-event-manager';
import { ApplicationService } from '../../../common/application/application.service';
import { OrderService } from '../order.service';
import { WaitingListService } from '../waiting-list.service';
import { PaymentGateway } from '../payment.gateway';
import { OrderCancelledHandler } from '../handlers/order-cancelled.handler';
import { EventSpotReleasedHandler } from '../handlers/event-spot-released.handler';
import { OrderCancelled } from '../../domain/events/domain-events/order-cancelled.event';
import { EventSpotReleased } from '../../domain/events/domain-events/event-spot-released.event';
import { Customer } from '../../domain/entities/customer.entity';
import { Partner } from '../../domain/entities/partner.entity';
import { OrderStatus } from '../../domain/entities/order.entity';
import { WaitingListStatus } from '../../domain/entities/waiting-list-entry.entity';
import { SpotOfferedToWaitingCustomer } from '../../domain/events/domain-events/spot-offered-to-waiting-customer.event';

describe('Cancel Order Flow - End to End In-Process Test', () => {
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
        StoredEventSchema,
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

  it('deve executar o fluxo completo de cancelamento e desencadear as reações de liberação de lugar e notificação da fila', async () => {
    const em = orm.em.fork();
    const uow = new UnitOfWorkMikroOrm(em);
    const domainEventManager = new DomainEventManager();
    const applicationService = new ApplicationService(uow, domainEventManager);

    const partnerRepo = new PartnerMysqlRepository(em);
    const customerRepo = new CustomerMysqlRepository(em);
    const eventRepo = new EventMysqlRepository(em);
    const orderRepo = new OrderMysqlRepository(em);
    const spotReservationRepo = new SpotReservationMysqlRepository(em);
    const waitingListRepo = new WaitingListMysqlRepository(em);

    // Registra os handlers no DomainEventManager, reproduzindo o EventsModule.onModuleInit
    const orderCancelledHandler = new OrderCancelledHandler(
      eventRepo,
      spotReservationRepo,
      domainEventManager,
    );
    domainEventManager.register(
      OrderCancelled.name,
      async (event: OrderCancelled) => {
        await orderCancelledHandler.handle(event);
      },
    );

    const eventSpotReleasedHandler = new EventSpotReleasedHandler(
      waitingListRepo,
      domainEventManager,
    );
    domainEventManager.register(
      EventSpotReleased.name,
      async (event: EventSpotReleased) => {
        await eventSpotReleasedHandler.handle(event);
      },
    );

    let integrationEventDispatched = false;
    domainEventManager.registerForIntegrationEvent(
      SpotOfferedToWaitingCustomer.name,
      async () => {
        integrationEventDispatched = true;
      },
    );

    const paymentGateway = new PaymentGateway();
    const orderService = new OrderService(
      orderRepo,
      customerRepo,
      eventRepo,
      spotReservationRepo,
      uow,
      paymentGateway,
      applicationService,
    );

    const waitingListService = new WaitingListService(
      waitingListRepo,
      customerRepo,
      eventRepo,
      applicationService,
    );

    // Cenário:
    // 1. Criar Parceiro
    const partner = Partner.create({ name: 'Partner 1' });
    await partnerRepo.add(partner);

    // 2. Criar Clientes A e B
    const customerA = Customer.create({
      name: 'Cliente A',
      cpf: '70375887091',
    });
    const customerB = Customer.create({
      name: 'Cliente B',
      cpf: '99346413050',
    });
    await customerRepo.add(customerA);
    await customerRepo.add(customerB);

    // 3. Criar Evento com 1 Seção e 1 Lugar
    const event = partner.initEvent({
      name: 'Show de Rock',
      description: 'Show imperdível',
      date: new Date(),
    });
    event.addSection({
      name: 'Pista VIP',
      description: 'Área VIP',
      price: 250,
      total_spots: 1,
    });
    event.publishAll();
    await eventRepo.add(event);

    await uow.commit();
    await em.clear();

    const section = event.sections[0];
    const spot = section.spots[0];

    // 4. Cliente A compra o único lugar da seção (esgotando a seção)
    const order = await orderService.create({
      event_id: event.id.value,
      section_id: section.id.value,
      spot_id: spot.id.value,
      customer_id: customerA.id.value,
      card_token: 'tok_visa',
    });

    expect(order.status).toBe(OrderStatus.PAID);

    // 5. Cliente B entra na lista de espera da seção esgotada
    await waitingListService.join({
      event_id: event.id.value,
      section_id: section.id.value,
      customer_id: customerB.id.value,
    });

    await em.clear();

    // Verificação de estado anterior ao cancelamento:
    const eventBeforeCancel = await eventRepo.findById(event.id);
    const spotBeforeCancel = eventBeforeCancel.sections[0].spots[0];
    expect(spotBeforeCancel.is_reserved).toBe(true);

    const reservationBeforeCancel = await spotReservationRepo.findById(spot.id);
    expect(reservationBeforeCancel).not.toBeNull();

    const waitingListBeforeCancel =
      await waitingListRepo.findByEventIdAndSectionId(event.id, section.id);
    expect(waitingListBeforeCancel.entries.size).toBe(1);
    expect([...waitingListBeforeCancel.entries][0].status).toBe(
      WaitingListStatus.PENDING,
    );

    // 6. DISPARA O ÚNICO COMANDO DE CANCELAMENTO
    const cancelledOrder = await orderService.cancel(order.id.value);
    expect(cancelledOrder.status).toBe(OrderStatus.CANCELLED);

    await em.clear();

    // 7. ASSERÇÕES DO FLUXO COMPLETO:
    // a) O spot voltou a disponível (is_reserved === false)
    const reloadedEvent = await eventRepo.findById(event.id);
    const reloadedSpot = reloadedEvent.sections[0].spots[0];
    expect(reloadedSpot.is_reserved).toBe(false);

    // b) A SpotReservation foi removida
    const reloadedReservation = await spotReservationRepo.findById(spot.id);
    expect(reloadedReservation).toBeNull();

    // c) A primeira entrada da fila está NOTIFIED
    const reloadedWaitingList = await waitingListRepo.findByEventIdAndSectionId(
      event.id,
      section.id,
    );
    expect(reloadedWaitingList).not.toBeNull();
    const [firstEntry] = [...reloadedWaitingList.entries];
    expect(firstEntry.customer_id.equals(customerB.id)).toBe(true);
    expect(firstEntry.status).toBe(WaitingListStatus.NOTIFIED);

    // d) O evento de integração foi disparado
    expect(integrationEventDispatched).toBe(true);
  });
});
