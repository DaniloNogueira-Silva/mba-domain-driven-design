import { IRepository } from '../../../common/domain/repository-interface';
import { EventSpotId } from '../entities/event-spot';
import { Event } from '../entities/event.entity';

export interface IEventRepository extends IRepository<Event> {
  findBySpotId(spotId: EventSpotId | string): Promise<Event | null>;
  findByEventSpotId(spotId: EventSpotId | string): Promise<Event | null>;
}
