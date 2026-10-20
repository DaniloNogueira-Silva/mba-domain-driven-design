import { CustomerId } from '../customer.entity';
import { EventSectionId } from '../event-section';
import { EventSpotId } from '../event-spot';
import { EventId } from '../event.entity';
import { WaitingList } from '../waiting-list.entity';
import { WaitingListStatus } from '../waiting-list-entry.entity';
import { CustomerJoinedWaitingList } from '../../events/domain-events/customer-joined-waiting-list.event';
import { SpotOfferedToWaitingCustomer } from '../../events/domain-events/spot-offered-to-waiting-customer.event';
import { initOrm } from './helpers';

describe('WaitingList Aggregate Unit Tests', () => {
  initOrm();

  it('deve adicionar uma entrada na lista de espera e registrar CustomerJoinedWaitingList', () => {
    const eventId = new EventId();
    const sectionId = new EventSectionId();
    const customerId = new CustomerId();

    const waitingList = WaitingList.create({
      event_id: eventId,
      section_id: sectionId,
    });

    const entry = waitingList.addEntry(customerId);

    expect(waitingList.entries.size).toBe(1);
    expect(entry.customer_id.equals(customerId)).toBe(true);
    expect(entry.status).toBe(WaitingListStatus.PENDING);
    expect(entry.sequence).toBe(1);

    const joinedEvents = [...waitingList.events].filter(
      (e) => e instanceof CustomerJoinedWaitingList,
    ) as CustomerJoinedWaitingList[];
    expect(joinedEvents).toHaveLength(1);
    expect(joinedEvents[0].aggregate_id.equals(waitingList.id)).toBe(true);
    expect(joinedEvents[0].event_id.equals(eventId)).toBe(true);
    expect(joinedEvents[0].section_id.equals(sectionId)).toBe(true);
    expect(joinedEvents[0].customer_id.equals(customerId)).toBe(true);
  });

  it('não deve permitir que o mesmo cliente entre duas vezes enquanto tiver entrada PENDING', () => {
    const waitingList = WaitingList.create({
      event_id: new EventId(),
      section_id: new EventSectionId(),
    });

    const customerId = new CustomerId();
    waitingList.addEntry(customerId);

    expect(() => waitingList.addEntry(customerId)).toThrow(
      'Customer already in waiting list',
    );
  });

  it('deve promover a primeira entrada PENDING para NOTIFIED e registrar SpotOfferedToWaitingCustomer', () => {
    const eventId = new EventId();
    const sectionId = new EventSectionId();
    const waitingList = WaitingList.create({
      event_id: eventId,
      section_id: sectionId,
    });

    const customer1 = new CustomerId();
    const customer2 = new CustomerId();
    const entry1 = waitingList.addEntry(customer1);
    const entry2 = waitingList.addEntry(customer2);

    expect(entry1.status).toBe(WaitingListStatus.PENDING);
    expect(entry2.status).toBe(WaitingListStatus.PENDING);

    const spotId = new EventSpotId();
    const promoted = waitingList.promoteFirstPending(spotId);

    expect(promoted).toBe(entry1);
    expect(entry1.status).toBe(WaitingListStatus.NOTIFIED);
    expect(entry2.status).toBe(WaitingListStatus.PENDING);

    const offeredEvents = [...waitingList.events].filter(
      (e) => e instanceof SpotOfferedToWaitingCustomer,
    ) as SpotOfferedToWaitingCustomer[];
    expect(offeredEvents).toHaveLength(1);
    expect(offeredEvents[0].aggregate_id.equals(waitingList.id)).toBe(true);
    expect(offeredEvents[0].customer_id.equals(customer1)).toBe(true);
    expect(offeredEvents[0].event_id.equals(eventId)).toBe(true);
    expect(offeredEvents[0].section_id.equals(sectionId)).toBe(true);
    expect(offeredEvents[0].spot_id.equals(spotId)).toBe(true);
  });

  it('deve permitir que o cliente entre novamente se sua entrada anterior já estiver NOTIFIED', () => {
    const waitingList = WaitingList.create({
      event_id: new EventId(),
      section_id: new EventSectionId(),
    });

    const customerId = new CustomerId();
    const entry1 = waitingList.addEntry(customerId);

    waitingList.promoteFirstPending(new EventSpotId());
    expect(entry1.status).toBe(WaitingListStatus.NOTIFIED);

    const entry2 = waitingList.addEntry(customerId);
    expect(entry2.status).toBe(WaitingListStatus.PENDING);
    expect(entry2.sequence).toBe(2);
    expect(waitingList.entries.size).toBe(2);
  });

  it('não deve fazer nada e não lançar erro ao notificar com fila vazia ou sem entradas PENDING', () => {
    const waitingList = WaitingList.create({
      event_id: new EventId(),
      section_id: new EventSectionId(),
    });

    const spotId = new EventSpotId();
    const res = waitingList.promoteFirstPending(spotId);
    expect(res).toBeNull();

    const customerId = new CustomerId();
    waitingList.addEntry(customerId);
    waitingList.promoteFirstPending(spotId);

    // Agora todas estão NOTIFIED
    const eventsCountBefore = waitingList.events.size;
    const res2 = waitingList.promoteFirstPending(spotId);
    expect(res2).toBeNull();
    expect(waitingList.events.size).toBe(eventsCountBefore);
  });
});
