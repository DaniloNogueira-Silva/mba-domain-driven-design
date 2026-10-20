import { Event } from '../event.entity';
import { PartnerId } from '../partner.entity';
import { initOrm } from './helpers';

describe('Event Entity Unit Tests', () => {
  initOrm();
  it('deve criar um evento', () => {
    const event = Event.create({
      name: 'Evento 1',
      description: 'Descrição do evento 1',
      date: new Date(),
      partner_id: new PartnerId(),
    });

    event.addSection({
      name: 'Sessão 1',
      description: 'Descrição da sessão 1',
      total_spots: 100,
      price: 1000,
    });

    expect(event.sections.size).toBe(1);
    expect(event.total_spots).toBe(100);

    const [section] = event.sections;

    expect(section.spots.size).toBe(100);

    // const spot = EventSpot.create();

    // section.spots.add(spot);

    // console.dir(event.toJSON(), { depth: 10 });

    // não é valido
    // customer = new Customer({
    //   id: '123', new CustomerId() || new CustomerId('')
    //   name: 'João',
    //   cpf: '99346413050',
    // });
  });

  test('deve publicar todos os itens do evento', () => {
    const event = Event.create({
      name: 'Evento 1',
      description: 'Descrição do evento 1',
      date: new Date(),
      partner_id: new PartnerId(),
    });

    event.addSection({
      name: 'Sessão 1',
      description: 'Descrição da sessão 1',
      total_spots: 100,
      price: 1000,
    });

    event.addSection({
      name: 'Sessão 2',
      description: 'Descrição da sessão 2',
      total_spots: 1000,
      price: 50,
    });

    event.publishAll();

    expect(event.is_published).toBe(true);

    const [section1, section2] = event._sections.values();
    expect(section1.is_published).toBe(true);
    expect(section2.is_published).toBe(true);

    [...section1.spots, ...section2.spots].forEach((spot) => {
      expect(spot.is_published).toBe(true);
    });
  });

  test('deve liberar um lugar e registrar EventSpotReleased', () => {
    const event = Event.create({
      name: 'Evento 1',
      description: 'Descrição do evento 1',
      date: new Date(),
      partner_id: new PartnerId(),
    });

    event.addSection({
      name: 'Sessão 1',
      description: 'Descrição da sessão 1',
      total_spots: 2,
      price: 100,
    });

    event.publishAll();

    const [section] = event.sections;
    const [spot1] = section.spots;

    event.markSpotAsReserved({
      section_id: section.id,
      spot_id: spot1.id,
    });
    expect(spot1.is_reserved).toBe(true);

    event.markSpotAsAvailable({ spot_id: spot1.id });
    expect(spot1.is_reserved).toBe(false);

    const releasedEvents = [...event.events].filter(
      (e) => e.constructor.name === 'EventSpotReleased',
    );
    expect(releasedEvents).toHaveLength(1);
    const releasedEvent = releasedEvents[0] as any;
    expect(releasedEvent.aggregate_id.equals(event.id)).toBe(true);
    expect(releasedEvent.section_id.equals(section.id)).toBe(true);
    expect(releasedEvent.spot_id.equals(spot1.id)).toBe(true);
  });

  test('deve lançar erro ao liberar um lugar que não está reservado', () => {
    const event = Event.create({
      name: 'Evento 1',
      description: 'Descrição do evento 1',
      date: new Date(),
      partner_id: new PartnerId(),
    });

    event.addSection({
      name: 'Sessão 1',
      description: 'Descrição da sessão 1',
      total_spots: 2,
      price: 100,
    });

    const [section] = event.sections;
    const [spot1] = section.spots;

    expect(() => event.markSpotAsAvailable({ spot_id: spot1.id })).toThrow(
      'Spot not reserved',
    );
  });
});
