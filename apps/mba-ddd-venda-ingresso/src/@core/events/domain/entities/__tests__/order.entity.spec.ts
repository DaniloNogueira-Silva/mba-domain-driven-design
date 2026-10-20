import { CustomerId } from '../customer.entity';
import { EventSpotId } from '../event-spot';
import { Order, OrderStatus } from '../order.entity';
import { OrderCancelled } from '../../events/domain-events/order-cancelled.event';

describe('Order Entity Unit Tests', () => {
  it('deve cancelar um pedido com sucesso e emitir OrderCancelled enriquecido', () => {
    const customerId = new CustomerId();
    const spotId = new EventSpotId();
    const order = Order.create({
      customer_id: customerId,
      event_spot_id: spotId,
      amount: 100,
    });

    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.toJSON().status).toBe('PENDING');

    order.cancel();

    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(order.toJSON().status).toBe('CANCELLED');

    const cancelledEvents = [...order.events].filter(
      (e) => e instanceof OrderCancelled,
    ) as OrderCancelled[];
    expect(cancelledEvents).toHaveLength(1);
    expect(cancelledEvents[0].aggregate_id.equals(order.id)).toBe(true);
    expect(cancelledEvents[0].status).toBe(OrderStatus.CANCELLED);
    expect(cancelledEvents[0].event_spot_id.equals(spotId)).toBe(true);
  });

  it('não deve permitir cancelar um pedido que já está cancelado', () => {
    const order = Order.create({
      customer_id: new CustomerId(),
      event_spot_id: new EventSpotId(),
      amount: 100,
    });

    order.cancel();

    expect(() => order.cancel()).toThrow('Order already cancelled');
  });
});
